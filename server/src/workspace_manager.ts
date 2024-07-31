import { defaultTo, get, groupBy, includes, isEqual, isNil, min, minBy, sortBy } from "lodash";
import TrieSearch from "trie-search";

import { TextDocument } from "vscode-languageserver-textdocument";
import { _Connection, Diagnostic, DiagnosticSeverity, InitializeParams, InitializeResult, SemanticTokens, TextDocumentChangeEvent, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver/node";
import { InlineCompletionFeatureShape } from "vscode-languageserver/lib/common/inlineCompletion.proposed";

import { MtsSettings } from "./mts_settings";
import { addOrUpdate, getParseTree, MTS, positionIteree } from "./utils";
import { FoundSymbol, MTScriptLegend, MTScriptVisitor, VariableUsage } from "./visitor";
import { FunctionDefinition, loadBuiltInFunctions, DocumentSymbolRef, SymbolRefs, SymbolType, DocumentFunctionRef, getArgCounts, loadRollOptions } from "./function_data";

export interface MtsDocument {
    // uri that points to TextDoccument instance
    uri: string;
    tokens: SemanticTokens;
    diagnostics: Array<Diagnostic>;
    vars: Map<string, VariableUsage>;
    // sorted ascending by range.start. Used for Hover.
    symbols: Array<DocumentSymbolRef>;
}

declare type ConnectionType = _Connection<unknown, unknown, unknown, unknown, unknown, unknown, InlineCompletionFeatureShape, unknown>

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
export const defaultSettings: MtsSettings = { maxNumberOfProblems: 1000, wikiUriRoot: 'https://wiki.rptools.info/index.php' };
let globalSettings: MtsSettings = defaultSettings;

function updateSymbols(map: Map<string, SymbolRefs>,
    uri: string,
    old: Array<DocumentSymbolRef>,
    incomming: Array<FoundSymbol>): Array<DocumentSymbolRef> {

    // remove old refs
    for (let dsr of old) {
        dsr.all.locations = dsr.all.locations.filter(f => f.uri);
        if (dsr.all.builtin && dsr.all.locations.length == 0) {
            map.delete(dsr.all.name);
        }
    }

    return sortBy(
        incomming.map(x => {
            const refs = addOrUpdate(
                map,
                x.name,
                k => {
                    return {
                        name: x.name,
                        type: x.type,
                        builtin: false,
                        locations: [{
                            range: x.range,
                            uri
                        }]
                    };
                },
                (k, v) => {
                    v.locations.push({
                        range: x.range,
                        uri
                    });
                    v.locations = sortBy(v.locations, x => x.uri, x => positionIteree(x.range.start));
                    return v;
                });

            return {
                range: x.range,
                all: refs,
                argCount: x.argCount
            };
        }),
        x => x.range.start.line,
        x => x.range.start.character
    );
}

export class WorkspaceManager {
    // map of all? built-in MapToolScript functions
    static BuiltInFunctions = loadBuiltInFunctions();
    static RollOptions = loadRollOptions();

    private readonly connection: ConnectionType;

    public documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
    public mtScripts: Map<string, MtsDocument> = new Map<string, MtsDocument>();
    public allSymbols = new Map<string, SymbolRefs>();
    public symbolsTrie = new TrieSearch<SymbolRefs>('name');
    public udfs = new Map<string, Set<string>>();
    // Cache the settings of all open documents
    public documentSettings: Map<string, Thenable<MtsSettings>> = new Map();

    public hasConfigurationCapability = false;
    public hasWorkspaceFolderCapability = false;
    public hasDiagnosticRelatedInformationCapability = false;

    constructor(connection: ConnectionType) {
        this.connection = connection;
        this.generateSymbolsFromFunctions(WorkspaceManager.BuiltInFunctions);
        this.documents.onDidClose(this.onDocumentDidClose);
        this.documents.onDidChangeContent(this.onDocumentChangedContent);
        this.documents.listen(connection);
    }

    public initialize = (params: InitializeParams) => {
        const capabilities = params.capabilities;

        // Does the client support the `workspace/configuration` request?
        // If not, we fall back using global settings.
        this.hasConfigurationCapability = !!(
            capabilities.workspace && !!capabilities.workspace.configuration
        );
        this.hasWorkspaceFolderCapability = !!(
            capabilities.workspace && !!capabilities.workspace.workspaceFolders
        );
        this.hasDiagnosticRelatedInformationCapability = !!(
            capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation
        );

        const result: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                // Tell the client that this server supports code completion.
                completionProvider: {
                    resolveProvider: true
                },
                diagnosticProvider: {
                    interFileDependencies: false,
                    workspaceDiagnostics: false
                },
                semanticTokensProvider: {
                    legend: MTScriptLegend,
                    full: true
                },
                hoverProvider: true
            }
        };
        if (this.hasWorkspaceFolderCapability) {
            result.capabilities.workspace = {
                workspaceFolders: {
                    supported: true
                }
            };
        }
        return result;
    }

    public validateTextDocument = async (textDocument: TextDocument): Promise<Diagnostic[]> => {
        const script = this.mtScripts.get(textDocument.uri);

        if (isNil(script)) {
            return [];
        }

        // In this simple example we get the settings for every validate run.
        const settings = await this.getDocumentSettings(textDocument.uri);

        let problems = 0;

        // visitor caught problems
        problems += script.diagnostics.length;
        const diagnostics: Diagnostic[] = script.diagnostics;

        // variable usage problems
        for (let name of script.vars.keys()) {
            if (problems > settings.maxNumberOfProblems) {
                break;
            }
            let usage = script.vars.get(name);
            if (isNil(usage)) { continue; }

            const set = defaultTo(min(usage.sets), Number.MAX_SAFE_INTEGER);
            for (let get of usage.gets) {
                if (problems > settings.maxNumberOfProblems) {
                    break;
                }
                if (get.position < set) {
                    const diagnostic: Diagnostic = {
                        severity: DiagnosticSeverity.Warning,
                        range: {
                            start: textDocument.positionAt(get.position),
                            end: textDocument.positionAt(get.position + get.length)
                        },
                        message: `${name} is not yet assigned.`,
                        source: 'mts'
                    }
                    diagnostics.push(diagnostic);
                    problems++;
                }
            }
        }
        return diagnostics;
    }

    public recalcTrie = () => {
        this.symbolsTrie.reset();
        this.symbolsTrie.addAll(Array.from(this.allSymbols.values()));
    }

    public getScriptInfo = async (uri: string): Promise<MtsDocument | null> => {
        const mts = this.mtScripts.get(uri);
        const textDocument = this.documents.get(uri);
        const oldSymbols = defaultTo(mts?.symbols, []);

        if (isNil(textDocument)) { return null; }

        const tree = getParseTree(textDocument);
        const visitor = new MTScriptVisitor();
        visitor.visit(tree);

        // sort functions by start position
        const foundSymbols = sortBy(visitor.getSymbols(), f => positionIteree(f.range.start));
        const semanticTokens = visitor.getTokens();
        const defines = new Set(visitor.defines);
        this.updateUDFs(uri, defines);

        const symbols = updateSymbols(this.allSymbols, uri, oldSymbols, foundSymbols);
        const functionProblems = this.diagnoseFunctions(symbols);
        this.recalcTrie();

        return {
            uri: uri,
            symbols: symbols,
            vars: visitor.vars,
            diagnostics: visitor.diagnostics.concat(functionProblems),
            tokens: semanticTokens,
        }
    }

    private getDocumentSettings = (resource: string): Thenable<MtsSettings> => {
        if (!this.hasConfigurationCapability) {
            return Promise.resolve(globalSettings);
        }
        let result = this.documentSettings.get(resource);
        if (!result) {
            result = this.connection.workspace.getConfiguration({
                scopeUri: resource,
                section: 'mapToolScriptServer'
            });
            this.documentSettings.set(resource, result);
        }
        return result;
    }

    private onDocumentChangedContent = async (change: TextDocumentChangeEvent<TextDocument>) => {
        const textDocument = change.document;
        if (textDocument.languageId === MTS) {
            const mts = await this.getScriptInfo(textDocument.uri)
            if (isNil(mts)) { return; }

            this.mtScripts.set(mts.uri, mts);
        } else if (this.mtScripts.has(textDocument.uri)) {
            this.mtScripts.delete(textDocument.uri);
        }
    }

    // Only keep settings for open documents
    private onDocumentDidClose = (e: TextDocumentChangeEvent<TextDocument>) => {
        this.documentSettings.delete(e.document.uri);
        this.mtScripts.delete(e.document.uri);
    }

    private generateSymbolsFromFunctions =
        (functions: Map<string, FunctionDefinition>) => {

            functions
                .forEach((f, k) => {
                    var refs = {
                        name: f.name,
                        type: SymbolType.function,
                        builtin: true,
                        locations: []
                    } as SymbolRefs;

                    this.allSymbols.set(refs.name, refs);
                    this.symbolsTrie.add(refs);
                })
        }

    private updateUDFs = (uri: string, defines: Set<string>) => {
        const toRemove: Array<string> = [];
        for (let [name, uris] of this.udfs) {
            if (defines.has(name)) {
                defines.delete(name);  // remove from set, so not re-added later
                if (uris.has(uri)) {
                    continue;
                } else {
                    uris.add(uri);
                }
            } else if (uris.has(uri)) {
                uris.delete(uri);
                if (uris.size == 0) {
                    toRemove.push(name);
                }
            }
        }

        for (let name in toRemove) {
            this.udfs.delete(name);
        }

        for (let name in defines) {
            addOrUpdate(
                this.udfs,
                name,
                (k) => {
                    return new Set<string>([uri]);
                },
                (k, v) => {
                    v.add(uri);
                    return v;
                }
            );
        }
    }

    private diagnoseFunctions = (symbols: Array<DocumentSymbolRef | DocumentFunctionRef>): Diagnostic[] => {
        const diagnostics: Array<Diagnostic> = [];
        for (let symbol of symbols) {
            const diagnostic = this.diagnoseFunction(symbol);
            if (!isNil(diagnostic)) {
                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }

    private diagnoseFunction = (ref: DocumentSymbolRef | DocumentFunctionRef): undefined | Diagnostic => {
        const argCount = get(ref, 'argCount');
        if (isNil(argCount)) {
            return;
        }

        const builtIn = WorkspaceManager.BuiltInFunctions.get(ref.all.name)
        if (isNil(builtIn)) {
            return;
        }

        const requiredCounts = getArgCounts(builtIn);

        if (argCount < requiredCounts[0]) {
            return {
                range: ref.range,
                severity: DiagnosticSeverity.Error,
                message: `Built-in function '${builtIn.name}' requires at least ${requiredCounts[0]} arguments.`
            }
        } else if (argCount > requiredCounts[1]) {
            return {
                range: ref.range,
                severity: DiagnosticSeverity.Error,
                message: `Built-in Function '${builtIn.name}' requires at most ${requiredCounts[1]} arguments.`
            }
        }
    }
}