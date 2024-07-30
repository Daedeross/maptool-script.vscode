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

import { MTScriptVisitor } from './visitor';
import { resetSymbols, SymbolRefs, SymbolType } from './function_data';
import { constructFunctionHover, getFunctionAtPosition, getWord, parametersToSignature, symbolToCompletionItemKind } from './utils';
import { defaultSettings, MtsDocument, WorkspaceManager } from './workspace_manager';
import { MtsSettings } from './mts_settings';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const manager: WorkspaceManager = new WorkspaceManager(connection);
// const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
// const mtScripts: Map<string, MtsDocument> = new Map<string, MtsDocument>();
// const allSymbols: AllSymbols =  {
//     byName: new Map<string, SymbolRefs>(),
//     trie: new TrieSearch<SymbolRefs>('name')
// };

connection.onInitialize(manager.initialize);

connection.onInitialized(async () => {
    if (manager.hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (manager.hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

let globalSettings: MtsSettings = defaultSettings;

connection.onDidChangeConfiguration(change => {
    if (manager.hasConfigurationCapability) {
        // Reset all cached document settings
        manager.documentSettings.clear();
    } else {
        globalSettings = <MtsSettings>(
            (change.settings.mapToolScriptServer || defaultSettings)
        );
    }
    // Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
    // We could optimize things here and re-fetch the setting first can compare it
    // to the existing setting, but this is out of scope for this example.
    connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<MtsSettings> {
    if (!manager.hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = manager.documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'mapToolScriptServer'
        });
        manager.documentSettings.set(resource, result);
    }
    return result;
}

connection.languages.diagnostics.on(async (params) => {
    const document = manager.documents.get(params.textDocument.uri);
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
    const script = manager.mtScripts.get(params.textDocument.uri);
    if (isNil(script)) {
        return;
    }

    const f_ref = getFunctionAtPosition(script.symbols, params.position);
    if (isNil(f_ref)) {
        return;
    }

    const f_def = WorkspaceManager.BuiltInFunctions.get(f_ref.all.name);
    if (isNil(f_def)) {
        return {
            contents: {
                kind: MarkupKind.PlainText,
                value: `${f_ref.all.name}`
            },
            range: f_ref.range
        };
    } else {
        return {
            contents: constructFunctionHover(globalSettings.wikiUriRoot, f_def),
            range: f_ref.range
        };
    }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
// manager.documents.onDidChangeContent(async change => {
//     const textDocument = change.document;
//     if (textDocument.languageId === MTS) {
//         const mts = await getScriptInfo(textDocument.uri)
//         if (isNil(mts)) { return; }

//         manager.mtScripts.set(mts.uri, mts);
//     } else if (mtScripts.has(textDocument.uri)) {
//         manager.mtScripts.delete(textDocument.uri);
//     }
//     // validateTextDocument(textDocument)
//     //     .then(diagnostics => connection.sendDiagnostics({ uri: textDocument.uri, diagnostics }));
// });

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
    const script = manager.mtScripts.get(textDocument.uri);

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

connection.onRequest("textDocument/semanticTokens/full", async (params) => {
    const uri = params.textDocument.uri;
    return manager.mtScripts.get(uri)?.tokens
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
        const f_def = WorkspaceManager.BuiltInFunctions.get(x.name);
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
            const document = manager.documents.get(_textDocumentPosition.textDocument.uri);
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
                const results = manager.symbolsTrie.search(word);
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

// Listen on the connection
connection.listen();
