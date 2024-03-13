import { CharStream, CommonTokenStream }  from 'antlr4';
import MTScript2Lexer from './grammars/MTScriptLexer';
import MTScript2Parser from './grammars/MTScriptParser';
import { MTScriptVisitor } from './visitor';

const input = "[if(bar): foo = 1; foo = 2]"
const chars = new CharStream(input);
const lexer = new MTScript2Lexer(chars);
const tokens = new CommonTokenStream(lexer);
const parser = new MTScript2Parser(tokens);

const tree = parser.macro();
console.log("foo");

var visitor = new MTScriptVisitor();

visitor.visit(tree);

var sematicTokens = visitor.getTokens();

console.log("DONE");