import { Diagnostic, DiagnosticSeverity, Position, Range, SemanticTokensBuilder, SemanticTokensLegend } from "vscode-languageserver";
import { defaultTo, get, isNil, lowerCase } from "lodash";
import { ParserRuleContext, Token } from "antlr4";

import {
    AddSubExpressionContext,
    ArgListContext,
    AssignmentContext,
    AtomContext,
    AtomicExpressionContext,
    BitContext,
    BlockContext,
    BooleanBinaryExpressionContext,
    BooleanUnaryExpressionContext,
    ComparisonExpressionContext,
    ExpressionContext,
    For_optionContext,
    FunctionCallContext,
    FunctionContext,
    Function_optionContext,
    IfThenCodeContext,
    IfThenCodeScriptContext,
    IfThenContext,
    IfThenScriptContext,
    MacroContext,
    MacroScriptContext,
    MulDivExpressionContext,
    NumericUnaryExpressionContext,
    OptionContext,
    ParentheticalExpressionContext,
    PowerExpressionContext,
    RollOptionsContext,
    ScriptBodyContext,
    ScriptContext,
    ScriptsContext,
    SimpleContext,
    SimpleScriptContext,
    Simple_optionContext,
    StatementContext,
    SwitchBodyContext,
    SwitchCaseContext,
    SwitchCodeBodyContext,
    SwitchCodeCaseContext,
    SwitchCodeContext,
    SwitchCodeScriptContext,
    SwitchContext,
    SwitchScriptContext,
    VariableContext
} from "./grammars/MTScriptParser";
import MTScriptParserVisitor from "./grammars/MTScriptParserVisitor";
import { IHaveRange, SymbolType } from "./function_data";

export enum TokenType {
    string = 0,
    keyword,
    colon,
    number,
    regexp,
    operator,
    function,
    variable,
}

// 
export interface FoundSymbol extends IHaveRange {
    name: string;
    type: SymbolType;
}


const nameOf = (t: TokenType) => TokenType[t];

export const MTScriptLegend: SemanticTokensLegend = {
    tokenTypes: [
        nameOf(TokenType.string),
        nameOf(TokenType.keyword),
        nameOf(TokenType.colon),
        nameOf(TokenType.number),
        nameOf(TokenType.regexp),
        nameOf(TokenType.operator),
        nameOf(TokenType.function),
        nameOf(TokenType.variable),
    ],
    tokenModifiers: []
};

const pushToken = (builder: SemanticTokensBuilder, token: Token | undefined, type: TokenType) => {
    if (isNil(token)) { return builder; }
    const text = token.text;
    const length = text.length;
    builder.push(token.line - 1, token.column, length, type, 0);

    return builder;
}

const toPosition = (token: Token): Position => {
    return {
        line: token.line - 1,
        character: token.column
    }
}

const toRange = (ctx: ParserRuleContext): Range => {
    let end = get(ctx, 'stop', ctx.start);
    return {
        start: toPosition(ctx.start),
        end: { line: end.line - 1, character: end.column + end.text.length }
    }
}

export interface VariableUsage {
    sets: Array<number>;
    gets: Array<{ position: number, length: number }>;
}

const AddSet = (map: Map<string, VariableUsage>, name: string, position: number) => {
    let usage = defaultTo(map.get(name), { sets: [], gets: [] });
    usage.sets.push(position);
    map.set(name, usage);
}

const AddGet = (map: Map<string, VariableUsage>, name: string, position: number, length: number) => {
    let usage = defaultTo(map.get(name), { sets: [], gets: [] });
    usage.gets.push({ position, length });
    map.set(name, usage);
}

export class MTScriptVisitor extends MTScriptParserVisitor<void> {
    private builder = new SemanticTokensBuilder();
    private symbols: Array<FoundSymbol> = [];
    public vars = new Map<string, VariableUsage>();
    public diagnostics: Array<Diagnostic> = [];

    constructor() {
        super();
        // macro.args is always set, either by the calling macro or defaults to string.empty
        AddSet(this.vars, "macro.args", -1);
    }

    getTokens = () => this.builder.build();

    getSymbols = () => this.symbols;

    visitMacro = (ctx: MacroContext) => {
        ctx.bit_list().forEach(element => {
            element.accept(this);
        });
    }

    visitBit = (ctx: BitContext) => {
        const macro = ctx.macroScript();
        if (!isNil(macro)) {
            macro.accept(this);
        }
    }

    // visitScript = (ctx: ScriptContext) => {
    //     console.log('ms' + ctx.start.line );
    // }

    visitSwitchCodeScript = (ctx: SwitchCodeScriptContext) => {
        ctx.switchCode().accept(this);
    }
    visitSwitchScript = (ctx: SwitchScriptContext) => {
        ctx.switch_().accept(this);
    }
    visitIfThenScript = (ctx: IfThenScriptContext) => { ctx.ifThen().accept(this); }
    visitIfThenCodeScript = (ctx: IfThenCodeScriptContext) => { ctx.ifThenCode().accept(this); }
    visitSimple = (ctx: SimpleContext) => { ctx.simpleScript().accept(this); }

    visitSimpleScript = (ctx: SimpleScriptContext) => {
        ctx.rollOptions()?.accept(this);
        pushToken(this.builder, ctx.COLON()?.symbol, TokenType.colon);
        ctx.scriptBody()?.accept(this);
    }

    visitSwitch = (ctx: SwitchContext) => {
        // visit any options before the 'switch'
        ctx._first?.accept(this);
        pushToken(this.builder, ctx.KEYWORD_SWITCH().symbol, TokenType.keyword);
        this.visit(ctx.expression());
        // visit options afer the switch
        ctx._second?.accept(this);

        pushToken(this.builder, ctx.COLON().symbol, TokenType.colon);
        this.visit(ctx.switchBody());
    }

    visitSwitchCode = (ctx: SwitchCodeContext) => {
        ctx._first?.accept(this);
        pushToken(this.builder, ctx.KEYWORD_SWITCH().symbol, TokenType.keyword);
        this.visit(ctx.expression());

        pushToken(this.builder, ctx.KEYWORD_CODE().symbol, TokenType.keyword);
        pushToken(this.builder, ctx.COLON().symbol, TokenType.operator);

        this.visit(ctx.switchCodeBody());
    }

    visitIfThen = (ctx: IfThenContext) => {
        ctx._first?.accept(this);
        pushToken(this.builder, ctx.KEYWORD_IF().symbol, TokenType.keyword);
        this.visit(ctx.expression());
        ctx._second?.accept(this);
        pushToken(this.builder, ctx.COLON().symbol, TokenType.colon);
        ctx._true_.accept(this);
        pushToken(this.builder, ctx.SEMI().symbol, TokenType.colon);
        ctx._false_.accept(this);
    }

    visitIfThenCode = (ctx: IfThenCodeContext) => {
        ctx._first?.accept(this);
        pushToken(this.builder, ctx.KEYWORD_IF().symbol, TokenType.keyword);
        this.visit(ctx.expression());
        ctx._second?.accept(this);
        pushToken(this.builder, ctx.COLON().symbol, TokenType.colon);
        pushToken(this.builder, ctx.KEYWORD_CODE().symbol, TokenType.keyword);
        ctx._true_.accept(this);
        pushToken(this.builder, ctx.SEMI().symbol, TokenType.colon);
        ctx._false_.accept(this);
    }

    visitSwitchBody = (ctx: SwitchBodyContext) => {
        ctx.switchCase_list().forEach(item => {
            this.visit(item);
        });
        pushToken(this.builder, ctx.KEYWORD_DEFAULT()?.symbol, TokenType.keyword);
        const _default_ = ctx.statement()
        if (!isNil(_default_)) {
            this.visit(_default_);
        }
    }

    visitSwitchCase = (ctx: SwitchCaseContext) => {
        pushToken(this.builder, ctx.KEYWORD_CASE()?.symbol, TokenType.keyword);
        this.visit(ctx.atom());
        pushToken(this.builder, ctx.COLON().symbol, TokenType.colon);
        this.visit(ctx.statement());
        pushToken(this.builder, ctx.SEMI().symbol, TokenType.colon);
    }

    visitSwitchCodeBody = (ctx: SwitchCodeBodyContext) => {
        ctx.switchCodeCase_list().forEach(item => {
            this.visit(item);
        });
        pushToken(this.builder, ctx.KEYWORD_DEFAULT()?.symbol, TokenType.keyword);
        const dflt = ctx.block()
        if (!isNil(dflt)) {
            this.visit(dflt);
        }
    }

    visitSwitchCodeCase = (ctx: SwitchCodeCaseContext) => {
        pushToken(this.builder, ctx.KEYWORD_CASE()?.symbol, TokenType.keyword);
        this.visit(ctx.atom());
        pushToken(this.builder, ctx.COLON().symbol, TokenType.colon);
        this.visit(ctx.block());
        pushToken(this.builder, ctx.SEMI().symbol, TokenType.colon);
    }

    visitRollOptions = (ctx: RollOptionsContext) => {
        ctx.option_list().forEach(option => {
            option.accept(this);
        })
    }

    visitOption = (ctx: OptionContext) => {
        let simple = ctx.simple_option();
        if (isNil(simple)) {
            const function_option = ctx.function_option();
            if (isNil(function_option)) {
                this.visit(ctx.for_option());
            } else {
                this.visit(ctx.function_option());
                this.visit(ctx.argList());
            }
        } else {
            this.visit(simple);
        }
    }

    visitSimple_option = (ctx: Simple_optionContext) => {
        const text = ctx.getText();
        const line = ctx.start.line - 1;
        const col = ctx.start.column;
        const length = text.length;
        this.builder.push(line, col, length, TokenType.keyword, 0);
    }

    visitFunction_option = (ctx: Function_optionContext) => {
        const text = ctx.getText();
        const line = ctx.start.line - 1;
        const col = ctx.start.column;
        const length = text.length;
        this.builder.push(line, col, length, TokenType.keyword, 0);
    }

    visitFor_option = (ctx: For_optionContext) => {
        pushToken(this.builder, ctx._for_, TokenType.keyword);

        let args = ctx.expression_list();
        let argCount = args.length;
        if (!isNil(ctx._invalid)) {
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: toRange(ctx._invalid),
                message: `The first argument to a for/foreach loop must be a variable declaration, found '${ctx._invalid.getText()}' instead.`,
                source: 'mts:for_loop'
            }
            this.diagnostics.push(diagnostic);
        }

        const variable = ctx.variable();
        if (!isNil(variable)) {
            this.visit(variable);
            var text = variable.getText();
            AddSet(this.vars, text, variable.start.start);
            //this.symbols.push();  // TODO: push symbol ref
            argCount++;
        }

        switch (lowerCase(ctx._for_.text)) {
            case 'for': {
                if (argCount < 3 || argCount > 5) {
                    const diagnostic: Diagnostic = {
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: toPosition(ctx.LPAREN().symbol),
                            end: toPosition(ctx.RPAREN().symbol)
                        },
                        message: `Invalid number of arguments in 'for' statement. Expected 3-5 arguments.`,
                        source: 'mts:for_loop'
                    }
                    this.diagnostics.push(diagnostic);
                }
                break;
            }
            case 'foreach': {
                if (argCount < 3 || argCount > 4) {
                    const diagnostic: Diagnostic = {
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: toPosition(ctx.LPAREN().symbol),
                            end: toPosition(ctx.RPAREN().symbol)
                        },
                        message: `Invalid number of arguments in 'foreach' statement. Expected 3-4 arguments.`,
                        source: 'mts:foreach_loop'
                    }
                    this.diagnostics.push(diagnostic);
                }
                break;
            }
            default: {
                console.warn("invalid token.");
                break;
            }
        }
        ctx.expression_list().forEach(element => {
            this.visit(element);
        });
    }

    visitScriptBody = (ctx: ScriptBodyContext) => {
        const statement = ctx.statement();
        if (isNil(statement)) {
            const block = ctx.block();
            if (isNil(block)) {
                console.warn("unreachable tree node?");
            } else {
                this.visit(ctx.block());
            }
        } else {
            this.visit(statement);
        }
    }

    visitBlock = (ctx: BlockContext) => {
        this.visit(ctx.scripts());
    }

    visitScripts = (ctx: ScriptsContext) => {
        ctx.bit_list().forEach(bit => bit.accept(this));
    }

    visitStatement = (ctx: StatementContext) => {
        const assn = ctx.assignment();
        if (isNil(assn)) {
            this.visit(ctx.expression());
        } else {
            this.visit(assn);
        }
    }

    visitAssignment = (ctx: AssignmentContext) => {
        const variable = ctx.variable();
        AddSet(this.vars, variable.getText(), variable.start.start);
        variable.accept(this);
        this.visit(ctx.expression());
    }

    visitParentheticalExpression = (ctx: ParentheticalExpressionContext) => {
        this.visit(ctx.expression());
    }
    visitFunctionCall = (ctx: FunctionCallContext) => {
        this.visit(ctx.function_());
    }
    visitAtomicExpression = (ctx: AtomicExpressionContext) => {
        this.visitAtom(ctx.atom());
    }
    visitPowerExpression = (ctx: PowerExpressionContext) => {
        this.visit(ctx._left);
        this.visit(ctx._right);
    }
    visitNumericUnaryExpression = (ctx: NumericUnaryExpressionContext) => {
        this.visit(ctx._right);
    }
    visitMulDivExpression = (ctx: MulDivExpressionContext) => {
        this.visit(ctx._left);
        this.visit(ctx._right);
    }
    visitAddSubExpression = (ctx: AddSubExpressionContext) => {
        this.visit(ctx._left);
        this.visit(ctx._right);
    }
    visitBooleanUnaryExpression = (ctx: BooleanUnaryExpressionContext) => {
        this.visit(ctx.expression());
    }
    visitComparisonExpression = (ctx: ComparisonExpressionContext) => {
        this.visit(ctx._left);
        this.visit(ctx._right);
    }
    visitBooleanBinaryExpression = (ctx: BooleanBinaryExpressionContext) => {
        this.visit(ctx._left);
        this.visit(ctx._right);
    }

    visitAtom = (ctx: AtomContext) => {
        //console.log('atom');
        const text = ctx.getText();
        const line = ctx.start.line - 1;
        const col = ctx.start.column;

        const variable = ctx.variable();
        if (isNil(variable)) {
            const numeric = ctx.numeric_literal();
            if (isNil(numeric)) {
                const bool = ctx.boolean_literal();
                if (isNil(bool)) {
                    this.builder.push(line, col, text.length, TokenType.string, 0);
                } else {
                    this.builder.push(line, col, text.length, TokenType.keyword, 0);
                }
            } else {
                this.builder.push(line, col, text.length, TokenType.number, 0);
            }
        } else {
            this.builder.push(line, col, text.length, TokenType.variable, 0);
            AddGet(this.vars, variable.getText(), variable.start.start, variable.getText().length);
        }
    }

    visitFunction = (ctx: FunctionContext) => {
        const variable = ctx.variable();
        const text = variable.getText();
        const line = ctx.start.line - 1;
        const col = ctx.start.column;

        this.builder.push(line, col, text.length, TokenType.function, 0);
        this.symbols.push({
            name: text,
            type: SymbolType.function,
            range: {
                start: { line: line, character: col },
                end: { line: line, character: col + text.length }   // line# is unchanged since identifiers cannot be broken by whitespace
            }
        })

        this.visit(ctx.argList());
    }

    visitArgList = (ctx: ArgListContext) => {
        ctx.expression_list()
            .forEach(exp => this.visit(exp));
    }

    visitVariable = (ctx: VariableContext) => {
        const text = ctx.getText();
        const line = ctx.start.line - 1;
        const col = ctx.start.column;

        this.builder.push(line, col, text.length, TokenType.variable, 0);
        // TODO: Add symbol
    }
};