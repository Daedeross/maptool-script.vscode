/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    DocumentDiagnosticReportKind,
    type DocumentDiagnosticReport,
    SemanticTokens,
    MarkupContent,
    MarkupKind,
    Range,
    TextEdit,
    InsertReplaceEdit,
    Command
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import { defaultTo, isNil, last, min, sortBy } from 'lodash';
import TrieSearch from 'trie-search';

import { CharStream, CommonTokenStream } from 'antlr4';
import MTScript2Lexer from './grammars/MTScriptLexer';
import MTScript2Parser from './grammars/MTScriptParser';
import { MTScriptVisitor, MTScriptLegend, VariableUsage } from './visitor';
import { addSymbools as addSymbols, AllSymbols, FunctionUsage, generateSymbolsFromFunctions, loadBuiltInFunctions, resetSymbols, SymbolRef, SymbolRefs, SymbolType } from './function_data';
import { constructFunctionHover, getFunctionAtPosition, getWord, parametersToSignature, symbolToCompletionItemKind } from './utils';

const MTS = 'mts';  // languageId

interface MtsDocument {
    uri: string;    // uri that points to TextDoccument instance
    tokens: SemanticTokens;
    diagnostics: Array<Diagnostic>;
    vars: Map<string, VariableUsage>;
    symbols: Array<SymbolRef>;
}

// map of all? built-in MapToolScript functions
const BuiltInFunctions = loadBuiltInFunctions();

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const mtScripts: Map<string, MtsDocument> = new Map<string, MtsDocument>();
const allSymbols: AllSymbols =  {
    byName: new Map<string, SymbolRefs>(),
    trie: new TrieSearch<SymbolRefs>('name')
};

generateSymbolsFromFunctions(allSymbols, BuiltInFunctions);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
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
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});

connection.onInitialized(async () => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

// The example settings
interface ExampleSettings {
    maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(
            (change.settings.mapToolScriptServer || defaultSettings)
        );
    }
    // Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
    // We could optimize things here and re-fetch the setting first can compare it
    // to the existing setting, but this is out of scope for this example.
    connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'mapToolScriptServer'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// 
// documents.onDidOpen(async e => {

// });

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
    mtScripts.delete(e.document.uri);
});

connection.languages.diagnostics.on(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (document !== undefined) {
        return {
            kind: DocumentDiagnosticReportKind.Full,
            items: await validateTextDocument(document)
        } satisfies DocumentDiagnosticReport;
    } else {
        // We don't know the document. We can either try to read it from disk
        // or we don't report problems for it.
        return {
            kind: DocumentDiagnosticReportKind.Full,
            items: []
        } satisfies DocumentDiagnosticReport;
    }
});

connection.onHover((params) => {
    const script = mtScripts.get(params.textDocument.uri);
    if (isNil(script)) {
        return;
    }

    const f_ref = getFunctionAtPosition(script.symbols, params.position);
    if (isNil(f_ref)) {
        return;
    }

    const f_def = BuiltInFunctions.get(f_ref.name);
    if (isNil(f_def)) {
        return {
            contents: {
                kind: MarkupKind.PlainText,
                value: `${f_ref.name}`
            },
            range: f_ref.range
        };
    } else {
        return {
            contents: constructFunctionHover(f_def),
            range: f_ref.range
        };
    }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async change => {
    const textDocument = change.document;
    if (textDocument.languageId === MTS) {
        const mts = await getScriptInfo(textDocument.uri)
        if (isNil(mts)) { return; }

        mtScripts.set(mts.uri, mts);
    } else if (mtScripts.has(textDocument.uri)) {
        mtScripts.delete(textDocument.uri);
    }
    // validateTextDocument(textDocument)
    //     .then(diagnostics => connection.sendDiagnostics({ uri: textDocument.uri, diagnostics }));
});

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
    const script = mtScripts.get(textDocument.uri);

    if (isNil(script)) {
        return [];
    }

    // In this simple example we get the settings for every validate run.
    const settings = await getDocumentSettings(textDocument.uri);

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

// async function getSemanticTokens(uri: string): Promise<SemanticTokens> {
//     const textDocument = documents.get(uri);

//     if (isNil(textDocument)) { return { data: []} }

//     const chars = new CharStream(textDocument.getText());
//     const lexer = new MTScript2Lexer(chars);
//     const tokens = new CommonTokenStream(lexer);
//     const parser = new MTScript2Parser(tokens);
//     const tree = parser.macro();
//     const visitor = new MTScriptVisitor();
//     visitor.visit(tree);
//     const tkns = visitor.getTokens();

//     return tkns;
// }

async function getScriptInfo(uri: string): Promise<MtsDocument | null> {
    const textDocument = documents.get(uri);

    if (isNil(textDocument)) { return null; }

    const chars = new CharStream(textDocument.getText());
    const lexer = new MTScript2Lexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new MTScript2Parser(tokens);
    const tree = parser.macro();
    const visitor = new MTScriptVisitor();
    visitor.visit(tree);

    // sort functions by start position
    const symbols = sortBy(visitor.getSymbols(), f => f.range.start.line, f => f.range.start.character);
    const semanticTokens = visitor.getTokens();

    resetSymbols(allSymbols);
    addSymbols(allSymbols, symbols, uri);

    return {
        uri: uri,
        symbols,
        vars: visitor.vars,
        diagnostics: visitor.diagnostics,
        tokens: semanticTokens
    }
}

connection.onRequest("textDocument/semanticTokens/full", async (params) => {
    const uri = params.textDocument.uri;
    if (mtScripts.has(uri)) {
        return mtScripts.get(uri)?.tokens
    }
});

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log('We received a file change event');
});

function symbolToCompletionItem(x: SymbolRefs, word: Range): CompletionItem {
    const item: CompletionItem = {
        label: x.name,
        kind: symbolToCompletionItemKind(x.type),
        data: word
    };

    if (x.type == SymbolType.function) {
        const f_def = BuiltInFunctions.get(x.name);
        if(!isNil(f_def?.usages)) {
            item.labelDetails = {
                detail: ' ' + parametersToSignature(last(f_def.usages))
            }
        }
    }

    return item;
}

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        try {
            const document = documents.get(_textDocumentPosition.textDocument.uri);
            if (isNil(document)) {
                return [];
            }

            // The pass parameter contains the position of the text document in
            // which code complete got requested. For the example we ignore this
            // info and always provide the same completion items.

            const word = getWord(document, _textDocumentPosition.position);
            if (!(isNil(word) || word.length == 0)) {
                const range: Range = {
                    start: {
                        line: _textDocumentPosition.position.line,
                        character: _textDocumentPosition.position.character - word.length - 1
                    },
                    end: _textDocumentPosition.position
                };
                const results = allSymbols.trie.search(word);
                if (results.length > 0) {
                    return results.map( x => symbolToCompletionItem(x, range));
                }
            }

            return [];
        }
        catch (error) {
            console.log(error);
            return [];
        }
    }
);

const moveCursorCommand: Command = {
    title: "Move cursor left between brackets",
    command: "cursorLeft"
};

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {

        if (item.kind == CompletionItemKind.Function) {
            item.textEdit = TextEdit.replace(item.data, `${item.label}()`);
            item.command = moveCursorCommand;
        }
        
        return item;
    }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
