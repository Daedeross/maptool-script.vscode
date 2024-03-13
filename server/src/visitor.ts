import { SemanticTokensBuilder, SemanticTokensLegend } from "vscode-languageserver";
import { defaultTo, isNil } from "lodash";

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
    TernaryExpressionContext,
    VariableContext
} from "./grammars/MTScriptParser";
import MTScriptParserVisitor from "./grammars/MTScriptParserVisitor";
import { Token } from "antlr4";

export enum TokenType {
    string = 0,
    keyword,
    number,
    regexp,
    operator,
    function,
    variable,
}

const nameOf = (t: TokenType) => TokenType[t];

export const MTScriptLegend: SemanticTokensLegend = {
    tokenTypes: [
        nameOf(TokenType.string),
        nameOf(TokenType.keyword),
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
    const ch = text.charCodeAt(0);
    const length = text.length;
    builder.push(token.line, ch, length, type, 0);

    return builder;
}

export interface VariableUsage {
    sets: Array<number>;
    gets: Array<{position:number, length:number}>;
}

const AddSet = (map: Map<string, VariableUsage>, name: string, position: number) => {
    let usage = defaultTo(map.get(name), { sets: [], gets: [] });
    usage.sets.push(position);
    map.set(name, usage);
}

const AddGet = (map: Map<string, VariableUsage>, name: string, position: number, length: number) => {
    let usage = defaultTo(map.get(name), { sets: [], gets: [] });
    usage.gets.push({position, length});
    map.set(name, usage);
}

export class MTScriptVisitor extends MTScriptParserVisitor<void>
{
    private builder = new SemanticTokensBuilder();
    public vars = new Map<string, VariableUsage>();

    getTokens = () => this.builder.build();

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

    // }

    visitSwitchCodeScript = (ctx: SwitchCodeScriptContext) => { ctx.switchCode().accept(this); }
    visitSwitchScript = (ctx: SwitchScriptContext) => { ctx.switch_().accept(this); }
    visitIfThenScript = (ctx: IfThenScriptContext) => { ctx.ifThen().accept(this); }
    visitIfThenCodeScript = (ctx: IfThenCodeScriptContext) => { ctx.ifThenCode().accept(this); }
    visitSimple = (ctx: SimpleContext) => { ctx.simpleScript().accept(this); }

    visitSwitch = (ctx: SwitchContext) => {
        pushToken(this.builder, ctx.KEYWORD_SWITCH().symbol, TokenType.keyword);
        this.visit(ctx._first);
        this.visit(ctx.expression());
        this.visit(ctx._second);
        this.visit(ctx.switchBody());
    }

    visitSwitchCode = (ctx: SwitchCodeContext) => {
        pushToken(this.builder, ctx.KEYWORD_SWITCH().symbol, TokenType.keyword);
        pushToken(this.builder, ctx.KEYWORD_CODE().symbol, TokenType.keyword);
        this.visit(ctx._first);
        this.visit(ctx.expression());
        this.visit(ctx._second);
        this.visit(ctx.switchCodeBody());
    }

    visitIfThen = (ctx: IfThenContext) => {
        pushToken(this.builder, ctx.KEYWORD_IF().symbol, TokenType.keyword);
        this.visit(ctx.expression());
        ctx._true_.accept(this);
        ctx._false_.accept(this);
    }

    visitIfThenCode = (ctx: IfThenCodeContext) => {
        pushToken(this.builder, ctx.KEYWORD_IF().symbol, TokenType.keyword);
        pushToken(this.builder, ctx.KEYWORD_CODE().symbol, TokenType.keyword);
        this.visit(ctx.expression());
        ctx._true_.accept(this);
        ctx._false_.accept(this);
    }

    visitSwitchBody = (ctx: SwitchBodyContext) => {
        ctx.switchCase_list().forEach(item => {
            this.visit(item);
        });
        pushToken(this.builder, ctx.KEYWORD_DEFAULT()?.symbol, TokenType.keyword);
        const dflt = ctx.statement()
        if (!isNil(dflt)) {
            this.visit(dflt);
        }
    }
    visitSwitchCase = (ctx: SwitchCaseContext) => {
        pushToken(this.builder, ctx.KEYWORD_CASE()?.symbol, TokenType.keyword);
        this.visit(ctx.atom());
        this.visit(ctx.statement());
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
        this.visit(ctx.block());
    }

    visitRollOptions = (ctx: RollOptionsContext) => {

    }

    visitOption = (ctx: OptionContext) => {
        let simple = ctx.simple_option();
        if (isNil(simple)) {
            this.visit(simple);
        } else {
            this.visit(ctx.function_option());
            this.visit(ctx.argList());
        }
    }

    visitSimple_option = (ctx: Simple_optionContext) => {
        const text = ctx.getText();
        const ch = text.charCodeAt(0);
        const length = text.length;
        this.builder.push(ctx.start.line, ch, length, TokenType.keyword, 0);
    }

    visitFunction_option = (ctx: Function_optionContext) => {
        const text = ctx.getText();
        const ch = text.charCodeAt(0);
        const length = text.length;
        this.builder.push(ctx.start.line, ch, length, TokenType.keyword, 0);
    }

    visitScriptBody = (ctx: ScriptBodyContext) => {
        const statement = ctx.statement();
        if (isNil(statement)) {
            this.visit(ctx.block());
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
        this.visit(ctx.expression());}
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
        const ch = text.charCodeAt(0);
        const line = ctx.start.line;

        const variable = ctx.variable();
        if (isNil(variable)) {
            const numeric = ctx.numeric_literal();
            if (isNil(numeric)) {
                const bool = ctx.boolean_literal();
                if (isNil(bool)) {
                    console.log("string");
                    this.builder.push(line, ch, text.length, TokenType.regexp, 0);
                } else {
                    this.builder.push(line, ch, text.length, TokenType.keyword, 0);
                }
            } else {
                this.builder.push(line, ch, text.length, TokenType.number, 0);
            }
        } else {
            this.builder.push(line, ch, text.length, TokenType.variable, 0);
            AddGet(this.vars, variable.getText(), variable.start.start, variable.getText().length);
        }
    }

    visitFunction = (ctx: FunctionContext) => {
        this.visit(ctx.variable());
        this.visit(ctx.argList());
    }
    visitArgList = (ctx: ArgListContext) => {
        ctx.expression_list()
            .forEach(exp => this.visit(exp));
    }

    visitVariable = (ctx: VariableContext) => {
        const text = ctx.getText();
        const ch = text.charCodeAt(0);
        const line = ctx.start.line;

        this.builder.push(line, ch, text.length, TokenType.variable, 0);
    }
};