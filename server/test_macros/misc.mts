[h: bar = 1]
[if(bar, 1, "2")]
[if(bar): foo = 1; foo = 2]
[if(bar): foo = 1; foo = "2"]
[for(i, 0, 10), code: {
    [r: i]
}]