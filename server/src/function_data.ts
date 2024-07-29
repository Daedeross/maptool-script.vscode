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

export interface SymbolRef extends IHaveRange {
    name: string;
    type: SymbolType;
}

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

    for (const def of builtin_functions) {
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

export const generateSymbolsFromFunctions =
    (allSymbols: AllSymbols, functions: Map<string, FunctionDefinition>) => {

        functions
            .forEach((f, k) => {
                var refs = {
                    name: f.name,
                    type: SymbolType.function,
                    builtin: true,
                    locations: []
                } as SymbolRefs;

                allSymbols.byName.set(refs.name, refs);
                allSymbols.trie.add(refs);
            })
    }

export const addSymbools =
    (allSymbols: AllSymbols, symbols: Array<SymbolRef>, uri: string) => {
        for (let s_ref of symbols) {
            addOrUpdate(
                allSymbols.byName,
                s_ref.name,
                _ => {
                    const newRef = {
                        name: s_ref.name,
                        type: s_ref.type,
                        builtin: false,
                        locations: [{
                            range: s_ref.range,
                            uri
                        }]
                    };
                    allSymbols.trie.add(newRef);

                    return newRef;
                },
                (k, v) => {
                    v.locations.push({ range: s_ref.range, uri })
                    return v;
                }
            );
        }
    }

export const resetSymbols = (allSymbols: AllSymbols) => {
    allSymbols.trie.reset();
    allSymbols.trie.addAll(Array.from(allSymbols.byName.values()));
}