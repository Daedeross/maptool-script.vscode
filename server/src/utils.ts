import { CompletionItem, CompletionItemKind, MarkupContent, MarkupKind, Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { isEmpty, isNil, last, sortedLastIndexBy } from "lodash";

import { CharStream, CommonTokenStream } from 'antlr4';
import MTScript2Lexer from './grammars/MTScriptLexer';
import MTScript2Parser from './grammars/MTScriptParser';
import { FunctionDefinition, FunctionUsage, DocumentSymbolRef, SymbolRefs, SymbolType } from "./function_data";

export const MTS = 'mts';  // languageId

export const positionIteree = (pos: Position) => pos.line * 1000 + pos.character;

export const getFunctionAtPosition = (symbols: Array<DocumentSymbolRef>, position: Position): DocumentSymbolRef | undefined => {
    const dummy: DocumentSymbolRef = {
        all: {
            name: '',
            type: SymbolType.unknown,
            locations: []
        },
        range: {
            start: position,
            end: position
        }
    }

    // @ts-ignore
    const start = sortedLastIndexBy(symbols, dummy, f => positionIteree(f.range.start) );

    if (start > 0) {
        const f_ref = symbols[start - 1];
        if (position.line === f_ref.range.start.line
            && position.character <= f_ref.range.end.character) {
            return f_ref;
        }
    }
}

export const parametersToSignature = (usage: FunctionUsage | undefined | null): string => {
    if(isNil(usage?.parameters) || isEmpty(usage.parameters)) {
        return '()';
    }

    let usageString = '( ';
    for (let var_name in usage.parameters) {
        usageString += `${var_name}, `;
    }
    usageString = usageString.replace(/, $/, '');
    usageString += ' )';

    return usageString;
}

export const constructFunctionHover = (wikiRoot: string, f_def: FunctionDefinition): MarkupContent => {
    const usage = last(f_def.usages);
    let usageString = '( ';
    let paramString = ''
    if (!isNil(usage?.parameters)) {
        for (let var_name in usage.parameters) {
            var param = usage.parameters[var_name];
            usageString += `${var_name}, `;
            paramString += `\n\n**${var_name}** \`${param.type}\` — ${param.description}`;
        }
        usageString = usageString.replace(/, $/, '');
        usageString += ' )';
    } else {
        usageString += ')'
    }

    const wiki = isNil(f_def.wiki)
        ? ''
        : `\n\nWiki: [${f_def.name}](${wikiRoot}${f_def.wiki})`;
    const value = `#### **${f_def.name}**${usageString}\n\n${f_def.description}${paramString}${wiki}`

    return {
        kind: MarkupKind.Markdown,
        value
    };
}

export function addOrUpdate<K, V>(map: Map<K, V>, key: K, addValue: (k: K) => V, updateValue: (k: K, v: V) => V ): V {
    const oldValue = map.get(key);

    const newValue = (oldValue === undefined)
        ?  addValue(key)
        :  updateValue(key, oldValue);
    map.set(key, newValue);

    return newValue;
}

const LastWordRE = /(?<=[^\w])\w+$/;

export const getWord = (document: TextDocument, position: Position): string | null => {
    const range: Range = {
        start: {
            line: position.line,
            character: 0
        },
        end: position
    }
    var text = document.getText(range);

    const matches = text.match(LastWordRE);
    if (isNil(matches)) {
        return null;
    } else {
        return matches[0];
    }
}

export const symbolToCompletionItemKind = (x: SymbolType): CompletionItemKind => {
    switch (x) {
        case SymbolType.function:
            return CompletionItemKind.Function;
        case SymbolType.rollOption:
            return CompletionItemKind.Keyword;
        case SymbolType.variable:
            return CompletionItemKind.Variable;
        default:
            return CompletionItemKind.Text;
    }
}

export const getParseTree = (document: TextDocument) => {
    const chars = new CharStream(document.getText());
    const lexer = new MTScript2Lexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new MTScript2Parser(tokens);
    return parser.macro();
}