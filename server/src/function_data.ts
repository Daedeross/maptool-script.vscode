import { defaultTo, get, isEmpty, isNil, min } from 'lodash';
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

export interface DocumentFunctionRef extends DocumentSymbolRef {
    argCount: number;
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
    default?: string;
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

export interface InlineFunctionDefinition {
    name?: string;
    aliases?: Array<string>;
    description?: string;
    isTrusted?: boolean;
    usages?: Array<FunctionUsage>;
    returns?: string;
    notes?: string,
    wiki?: string;
}

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

const jsonRE = /\{.*\}/m;

export const extractDocumentation = (text: string): InlineFunctionDefinition | undefined => {
    const match = text.match(jsonRE);
    if (isNil(match)) {
        return;
    }
    try {
        return JSON.parse(match[0]) as InlineFunctionDefinition;
    }
    catch {
        return;
    }
}

export const getArgCounts = (def: InlineFunctionDefinition | FunctionDefinition) => {
    if (isNil(def.usages)) {
        return [0, 0];
    }

    let min = Number.MAX_SAFE_INTEGER;
    let max = 0;
    for (let usage of def.usages) {
        if (isNil(usage.parameters)) {
            min = 0;
            continue;
        }

        let localMin = 0;
        let localMax = 0;
        for (let name in usage.parameters) {
            localMax++;
            if (!usage.parameters[name].default) {
                localMin++
            }
        }

        min = Math.min(min, localMin);
        max = Math.max(max, localMax);
    }

    return [min, max]
}