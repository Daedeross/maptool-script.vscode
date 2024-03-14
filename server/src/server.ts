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
    SemanticTokens
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import { CharStream, CommonTokenStream }  from 'antlr4';
import MTScript2Lexer from './grammars/MTScriptLexer';
import MTScript2Parser from './grammars/MTScriptParser';
import { MTScriptVisitor, MTScriptLegend } from './visitor';
import { defaultTo, isNil, min } from 'lodash';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    console.log('server activate');
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
            // semanticTokensProvider: {
            //     legend: MTScriptLegend,
            //     full: true
            // }
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

connection.onInitialized(() => {
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

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
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

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async change => {
//     const textDocument = change.document;
//     validateTextDocument(textDocument)
//         .then(diagnostics =>  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics }));
});

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
    // In this simple example we get the settings for every validate run.
    const settings = await getDocumentSettings(textDocument.uri);

    let problems = 0;
    

    const chars = new CharStream(textDocument.getText());
    const lexer = new MTScript2Lexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new MTScript2Parser(tokens);
    const tree = parser.macro();
    const visitor = new MTScriptVisitor();
    visitor.visit(tree);

    // visitor caught problems
    problems += visitor.diagnostics.length;
    const diagnostics: Diagnostic[] = visitor.diagnostics;

    // variable usage problems
    for (let name of visitor.vars.keys()) {
        if (problems > settings.maxNumberOfProblems) {
            break;
        }
        let usage = visitor.vars.get(name);
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

async function getSemanticTokens(uri: string): Promise<SemanticTokens> {
    const textDocument = documents.get(uri);

    if (isNil(textDocument)) { return { data: []} }

    const chars = new CharStream(textDocument.getText());
    const lexer = new MTScript2Lexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new MTScript2Parser(tokens);
    const tree = parser.macro();
    const visitor = new MTScriptVisitor();
    visitor.visit(tree);

    return visitor.getTokens();
}

connection.onRequest("textDocument/semanticTokens/full", async (params) => {
    // Implement your logic to provide semantic tokens for the given document here.
    // You should return the semantic tokens as a response.
    const semanticTokens = await getSemanticTokens(params.textDocument.uri);
    return semanticTokens;
  });

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. For the example we ignore this
        // info and always provide the same completion items.
        return [
            {
                label: 'TypeScript',
                kind: CompletionItemKind.Text,
                data: 1
            },
            {
                label: 'JavaScript',
                kind: CompletionItemKind.Text,
                data: 2
            }
        ];
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            item.detail = 'TypeScript details';
            item.documentation = 'TypeScript documentation';
        } else if (item.data === 2) {
            item.detail = 'JavaScript details';
            item.documentation = 'JavaScript documentation';
        }
        return item;
    }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
