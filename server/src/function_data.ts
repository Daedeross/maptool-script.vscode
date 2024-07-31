import { defaultTo, isEmpty, isNil } from 'lodash';
import { Range } from 'vscode-languageserver';
import TrieSearch from 'trie-search';

import * as builtin_functions from './data/functions.mts.json';
import * as roll_options from './data/roll-options.mts.json';

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

export interface RollOptionImport {
    name: string,
    aliases?: Array<string>;
    description?: string;
    parameters?: { [index: string]: FunctionParameter };
    wiki?: string;
}

export interface RollOptionDefinition extends RollOptionImport {
    argMin: number;
    argMax: number;
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

export const loadRollOptions = () => {
    const all_roll_options = new Map<string, RollOptionDefinition>();

    for (const r_import of roll_options.filter(r => r.name.length > 0)) {
        const r_def = r_import as RollOptionImport;

        const _counts = getParamCount(r_def.parameters);
        const def: RollOptionDefinition = {
            ...r_def,
            argMin: _counts[0],
            argMax: _counts[1],
        }

        // add definition, indexed by name
        all_roll_options.set(r_def.name, def);

        // add aliases' indices
        if (!(isNil(r_def.aliases) || isEmpty(r_def.aliases))) {
            for (const alias of r_def.aliases) {
                all_roll_options.set(alias, def);
            }
        }
    }

    return all_roll_options;
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

export const getParamCount = (params: { [index: string]: FunctionParameter } | undefined) => {
    if (isNil(params)) {
        return [0, 0];
    }

    let localMin = 0;
    let localMax = 0;
    for (let name in params) {
        localMax++;
        if (!params[name].default) {
            localMin++
        }
        if (params[name].isParamArray === true) {
            localMax = Number.MAX_SAFE_INTEGER;
            break;
        }
    }

    return [localMin, localMax];
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

        const local = getParamCount(usage.parameters);

        min = Math.min(min, local[0]);
        max = Math.max(max, local[1]);
    }

    return [min, max]
}