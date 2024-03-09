lexer grammar MTScriptLexer;

options { caseInsensitive=true; }

OPEN_SCRIPT
    : LBRACK -> pushMode(SCRIPT);

TEXT
    : .+?;

DWS : [ \t\r\n\u000C]+  -> channel(HIDDEN); // ignore whitespace outside scripts

mode SCRIPT;

OPEN_SUB_SCRIPT
    : LBRACK -> pushMode(SCRIPT);

CLOSE_SCRIPT
    : RBRACK -> popMode;

// Separators
LPAREN  : '(';
RPAREN  : ')';
LBRACE  : '{';
RBRACE  : '}';
LBRACK  : '[';
RBRACK  : ']';
SEMI    : ';';
COMMA   : ',';
DOT     : '.';

// Operators
ASSIGN  : '=' ;
PLUS    : '+' ;
MINUS   : '-' ;
TIMES   : '*' ;
DIV     : '/' ;
GT      : '>' ;
LT      : '<' ;
EQ      : '==' ;
GEQ     : '>=' ;
LEQ     : '<=' ;
NEQ     : '!=' ;
POW     : '^' ;
AND     : '&&';
OR      : '||';
NOT     : '!';
QMARK   : '?' ;
COLON   : ':' ;
DQUOTE  : '"' ;


// Keywords
KEYWORD_CASE        : 'case';
KEYWORD_DEFAULT     : 'default';
KEYWORD_TRUE        : 'true';
KEYWORD_FALSE       : 'false';

// Roll Options
KEYWORD_CODE        : 'code';
KEYWORD_COUNT       : 'count' | 'c';
KEYWORD_DIALOG      : 'dialog' | 'dialog5';
KEYWORD_EXPANDED    : 'expanded' | 'e';
KEYWORD_FOR         : 'for';
KEYWORD_FOREACH     : 'foreach';
KEYWORD_FRAME       : 'frame' | 'frame5';
KEYWORD_GM          : 'gm' | 'g';
KEYWORD_GMTT        : 'gmtt' | 'gt';
KEYWORD_HIDE        : 'hidden' | 'hide' | 'h';
KEYWORD_IF          : 'if';
KEYWORD_MACRO       : 'macro';
KEYWORD_OVERLAY     : 'overlay';
KEYWORD_RESULT      : 'result' | 'r';
KEYWORD_SELF        : 'self' | 's';
KEYWORD_SELFT       : 'selftt' | 'st';
KEYWORD_SWITCH      : 'switch';
KEYWORD_TOOLTIP     : 'tooltip' | 't';
KEYWORD_TOKEN       : 'token';
KEYWORD_UNFORMATTED : 'unformatted' | 'u';
KEYWORD_WHILE       : 'while';
KEYWORD_WHISPER     : 'whisper' | 'w';

WS           : [ \t\r\n\u000C]+  -> channel(HIDDEN);     // ignore whitespace inside scripts

IDENTIFIER : VALID_ID_START VALID_ID_CHAR* ;

// LITERALS
INT
    : Digit+
    ;

HEX
    : '0' [x] HexDigit+
    ;

FLOAT
    : Digit+ '.' Digit* ExponentPart?
    | '.' Digit+ ExponentPart?
    | Digit+ ExponentPart
    ;

HEX_FLOAT
    : '0' [x] HexDigit+ '.' HexDigit* HexExponentPart?
    | '0' [x] '.' HexDigit+ HexExponentPart?
    | '0' [x] HexDigit+ HexExponentPart
    ;

fragment VALID_ID_START : Letter;
fragment VALID_ID_CHAR  : VALID_ID_START | ('0' .. '9') ;
fragment Digit          : ('0' .. '9') ;
fragment HexDigit       : [0-9a-f] ;

fragment LetterOrDigit
    : Letter
    | [0-9]
    ;

fragment Letter
    options { caseInsensitive=false; }
    : [a-zA-Z_] // Java letters below 0x7F
    | ~[\u0000-\u007F\uD800-\uDBFF] // covers all characters above 0x7F which are not a surrogate
    | [\uD800-\uDBFF] [\uDC00-\uDFFF] // covers UTF-16 surrogate pairs encodings for U+10000 to U+10FFFF
    ;

// Fragment rules
fragment ExponentPart
    : [e] [+-]? Digit+
    ;

fragment HexExponentPart
    : [p] [+-]? Digit+
    ;

NORMALSTRING
    : '"' ( EscapeSequence | ~('\\'|'"') )* '"'
    ;

CHARSTRING
    : '\'' ( EscapeSequence | ~('\''|'\\') )* '\''
    ;

fragment EscapeSequence
    : '\\' [abfnrtvz"'\\]
    | '\\' '\r'? '\n'
    | DecimalEscape
    | HexEscape
    | UtfEscape
    ;

fragment DecimalEscape
    : '\\' Digit
    | '\\' Digit Digit
    | '\\' [0-2] Digit Digit
    ;

fragment HexEscape      : '\\' 'x' HexDigit HexDigit ;
fragment UtfEscape      : '\\' 'u{' HexDigit+ '}' ;
