import { isEmpty, isNil } from 'lodash';
import * as builtin_functions from './data/functions.mts.json';
import { Range } from 'vscode-languageserver';
import TrieSearch from 'trie-search';
import { addOrUpdate } from './utils';

const EXTENSION_ID = 'bryan-c-jones.maptool-script';

export enum SymbolType {
    unknown = 0,
    function,
    rollOption,
    variable
}

export interface IHaveRange {
    range: Range;
}

export interface DocumentRange extends IHaveRange {
    uri: string;
}

// Represents a single reference to a symbol in a document
export interface DocumentSymbolRef extends IHaveRange {
    all: SymbolRefs;
}

// Represents all references in the workspace for a symbol.
export interface SymbolRefs {
    name: string;
    type: SymbolType;
    builtin?: boolean;
    locations: Array<DocumentRange>;
}

export interface FunctionParameter {
    type: string;
    description?: string;
    isParamArray?: boolean;
}

export interface FunctionUsage {
    parameters?: { [index: string]: FunctionParameter }
    isTrusted?: boolean;
}

export interface FunctionDefinition {
    name: string;
    aliases?: Array<string>;
    description?: string;
    isTrusted?: boolean;
    usages?: Array<FunctionUsage>;
    returns?: string;
    notes?: string,
    wiki?: string;
};

export interface AllSymbols {
    byName: Map<string, SymbolRefs>;
    trie: TrieSearch<SymbolRefs>;
}

export const loadBuiltInFunctions = (): Map<string, FunctionDefinition> => {

    const all_functions = new Map<string, FunctionDefinition>();

    for (const def of builtin_functions.filter(f => f.name.length > 0)) {
        const f_def = def as FunctionDefinition;
        if (isNil(f_def.usages)) {
            f_def.usages = [{}]
        }

        // add definition, indexed by name
        all_functions.set(f_def.name, f_def);

        // add aliases' indices
        if (!(isNil(f_def.aliases) || isEmpty(f_def.aliases))) {
            for (const alias of f_def.aliases) {
                all_functions.set(alias, f_def);
            }
        }
    }

    return all_functions;
}

// export const addSymbols =
//     (allSymbols: AllSymbols, symbols: Array<DocumentSymbolRef>, uri: string) => {
//         for (let s_ref of symbols) {
//             addOrUpdate(
//                 allSymbols.byName,
//                 s_ref.name,
//                 _ => {
//                     const newRef = {
//                         name: s_ref.name,
//                         type: s_ref.type,
//                         builtin: false,
//                         locations: [{
//                             range: s_ref.range,
//                             uri
//                         }]
//                     };
//                     allSymbols.trie.add(newRef);

//                     return newRef;
//                 },
//                 (k, v) => {
//                     v.locations.push({ range: s_ref.range, uri })
//                     return v;
//                 }
//             );
//         }
//     }

export const resetSymbols = (allSymbols: AllSymbols) => {
    allSymbols.trie.reset();
    allSymbols.trie.addAll(Array.from(allSymbols.byName.values()));
}