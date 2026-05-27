import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// Set default font for pdfmake
pdfMake.vfs = pdfFonts.pdfMake.vfs;

// If the project uses custom Vietnamese fonts or Times New Roman, declare here:
// pdfMake.fonts = {
//   Roboto: {
//     normal: 'Roboto-Regular.ttf',
//     bold: 'Roboto-Medium.ttf',
//     italics: 'Roboto-Italic.ttf',
//     bolditalics: 'Roboto-MediumItalic.ttf'
//   }
// };

function isImageVal(val) {
    if (typeof val !== 'string') return false;
    val = val.trim();
    return val.startsWith('data:image/') || 
           val.startsWith('http://') || 
           val.startsWith('https://') || 
           val.endsWith('.png') || 
           val.endsWith('.jpg') || 
           val.endsWith('.jpeg') || 
           val.endsWith('.svg');
}

function evaluateFx(expr, data) {
    try {
        if (/\breturn\b/.test(expr)) {
            var fn = new Function('$data', expr);
            var res = fn(data);
            return res !== undefined && res !== null ? res : '';
        }
        var fn = new Function('$data', 'return eval(arguments[1]);');
        var res = fn(data, expr);
        return res !== undefined && res !== null ? res : '';
    } catch (e) {
        return 'Fx Error: ' + e.message;
    }
}

function isElementVisible(el, data) {
    if (!el.useShowFx || !el.showFx || el.showFx.trim() === '') return true;
    try {
        var res = evaluateFx(el.showFx, data);
        if (typeof res === 'string' && res.startsWith('Fx Error:')) {
            return true;
        }
        return !!res;
    } catch (e) {
        return true;
    }
}

function getParsedWidth(widthVal, pageConfig) {
    if (widthVal === undefined || widthVal === null) return 100;
    var wStr = widthVal.toString().trim();
    if (wStr.indexOf('%') !== -1) {
        var pct = parseFloat(wStr) || 100;
        var paperSize = pageConfig.paperSize || 'LETTER';
        var paperOrient = pageConfig.paperOrient || 'portrait';
        var sizes = { LETTER:[612,792], A4:[595,842], A5:[420,595], LEGAL:[612,1008] };
        var s = sizes[paperSize] || sizes.LETTER;
        var w = (paperOrient==='landscape'?s[1]:s[0]);
        var printableW = w - (pageConfig.marginLeft || 0) - (pageConfig.marginRight || 0);
        return Math.round((pct / 100) * printableW);
    }
    return parseFloat(wStr) || 100;
}

function getRotatedSize(w, h, angle) {
    var rad = Math.abs(angle || 0) * Math.PI / 180;
    var cos = Math.abs(Math.cos(rad));
    var sin = Math.abs(Math.sin(rad));
    var newW = w * cos + h * sin;
    var newH = w * sin + h * cos;
    return {
        w: Math.ceil(newW),
        h: Math.ceil(newH),
        dx: Math.ceil((newW - w) / 2),
        dy: Math.ceil((newH - h) / 2)
    };
}

function getElementWidth(el, pageConfig) {
    if (el.type === 'table') {
        var parsedWidths = (el.widths || '').split(',').map(function(w){return w.trim();});
        var hasRelative = false;
        var totalFixed = 0;
        el.headers.forEach(function(h, i) {
            var w = parsedWidths[i] || '*';
            if (isNaN(w) || w === '') {
                hasRelative = true;
            } else {
                totalFixed += parseFloat(w) || 0;
            }
        });
        if (!hasRelative && totalFixed > 0) {
            return totalFixed;
        }
        return getParsedWidth(el.width, pageConfig) || 500;
    }
    if (el.type === 'text' || el.type === 'var' || el.type === 'shape' || el.type === 'columns' || el.type === 'image' || el.type === 'panel') {
        return getParsedWidth(el.width, pageConfig) || 100;
    }
    if (el.type === 'line') {
        return getParsedWidth(el.lineWidth, pageConfig) || 100;
    }
    if (el.type === 'rect') {
        return getParsedWidth(el.rectW, pageConfig) || 100;
    }
    return 100;
}

function getElementHeight(el, variables) {
    if (el.type === 'shape') {
        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
        return rSize.h;
    }
    if (el.type === 'rect') return el.rectH || 20;
    if (el.type === 'line') return el.lineWeight || 1;
    if (el.type === 'text' || el.type === 'var') return el.fontSize || 13;
    if (el.type === 'table') {
        var displayData = el.data || [];
        if (el.dataVar && variables && Array.isArray(variables[el.dataVar])) {
            displayData = variables[el.dataVar];
        }
        var rowsCount = displayData.length + (el.showHeader !== false ? 1 : 0);
        return rowsCount * (el.fontSize + 8) + 10;
    }
    if (el.type === 'image') return el.height || 100;
    if (el.type === 'panel') return el.height || 150;
    return 20;
}

function elementToNode(el, imagesDict, variables, elements, pageConfig) {
    switch(el.type) {
        case 'text':
            var textColor = el.color;
            if (el.isColorFx && el.colorFx) {
                var evaluatedColor = evaluateFx(el.colorFx, variables);
                if (evaluatedColor && !evaluatedColor.startsWith('Fx Error:')) {
                    textColor = evaluatedColor;
                }
            }
            return { text: el.text, fontSize: el.fontSize, bold: el.bold, italics: el.italic, alignment: el.align, color: textColor, width: el.width };
        case 'var':
            var displayVal = '';
            if (el.isFx) {
                displayVal = el.fxExpr ? evaluateFx(el.fxExpr, variables) : '';
            } else {
                displayVal = variables[el.varName] !== undefined ? variables[el.varName] : '';
            }
            var val = (el.prefix||'') + displayVal;
            var textColor = el.color || '#000000';
            if (el.isColorFx && el.colorFx) {
                var evaluatedColor = evaluateFx(el.colorFx, variables);
                if (evaluatedColor && !evaluatedColor.startsWith('Fx Error:')) {
                    textColor = evaluatedColor;
                }
            }
            return { text: val, fontSize: el.fontSize, bold: el.bold, italics: el.italic, alignment: el.align, color: textColor, width: el.width, noWrap: el.wrap === false ? true : undefined };
        case 'line':
            return { canvas: [{ type:'line', x1:0, y1:0, x2:el.lineWidth, y2:0, lineWidth:el.lineWeight, lineColor:el.color }] };
        case 'rect':
            return { canvas: [{ type:'rect', x:0, y:0, w:el.rectW, h:el.rectH, r:el.radius, lineWidth:el.lineWeight, lineColor:el.color, color:el.fillColor||undefined }] };
        case 'shape':
            var shW = el.width || 100;
            var shH = el.height || 50;
            var shType = el.shapeType || 'rect';
            var shBdrW = el.lineWidth || 1;
            var shBdrC = el.color || '#000000';
            var shFill = el.fillColor || 'none';
            var angle = el.rotate || 0;
            
            var rSize = getRotatedSize(shW, shH, angle);
            var svgStr = '<svg width="'+rSize.w+'" height="'+rSize.h+'" viewBox="0 0 '+rSize.w+' '+rSize.h+'" xmlns="http://www.w3.org/2000/svg">';
            svgStr += '<g transform="translate('+(rSize.w/2)+' '+(rSize.h/2)+') rotate('+angle+') translate('+(-shW/2)+' '+(-shH/2)+')">';
            
            if (shType === 'rect') {
                var r = el.radius || 0;
                svgStr += '<rect x="'+(shBdrW/2)+'" y="'+(shBdrW/2)+'" width="'+(shW-shBdrW)+'" height="'+(shH-shBdrW)+'" rx="'+r+'" ry="'+r+'" stroke="'+shBdrC+'" stroke-width="'+shBdrW+'" fill="'+shFill+'" />';
            } else if (shType === 'line') {
                svgStr += '<line x1="0" y1="'+(shH/2)+'" x2="'+shW+'" y2="'+(shH/2)+'" stroke="'+shBdrC+'" stroke-width="'+shBdrW+'" />';
            } else if (shType === 'ellipse') {
                svgStr += '<ellipse cx="'+(shW/2)+'" cy="'+(shH/2)+'" rx="'+((shW-shBdrW)/2)+'" ry="'+((shH-shBdrW)/2)+'" stroke="'+shBdrC+'" stroke-width="'+shBdrW+'" fill="'+shFill+'" />';
            } else if (shType === 'polygon') {
                var pts = el.points || '0,0 50,50 100,0';
                if (el.close) {
                    svgStr += '<polygon points="'+pts+'" stroke="'+shBdrC+'" stroke-width="'+shBdrW+'" fill="'+shFill+'" />';
                } else {
                    svgStr += '<polyline points="'+pts+'" stroke="'+shBdrC+'" stroke-width="'+shBdrW+'" fill="none" />';
                }
            }
            svgStr += '</g></svg>';
            return { svg: svgStr, width: rSize.w, height: rSize.h };
        case 'table':
            var tableW = getElementWidth(el, pageConfig);
            var widths = el.widths.split(',').map(function(w) { 
                w = w.trim(); 
                if (w.indexOf('%') !== -1) {
                    var pct = parseFloat(w) || 0;
                    return Math.round((pct / 100) * tableW);
                }
                return isNaN(w) ? w : +w; 
            });
            var pdfHAligns = (el.headerAligns||'center').split(',').map(function(a){return a.trim();});
            var pdfBAligns = (el.bodyAligns||'left').split(',').map(function(a){return a.trim();});
            var colFills = (el.colFills || '').split(',').map(function(f){return f.trim();});
            var oddFill = el.oddRowFill || '';
            var evenFill = el.evenRowFill || '';
            
            var displayData = el.data || [];
            if (el.dataVar && Array.isArray(variables[el.dataVar])) {
                var varData = variables[el.dataVar];
                var fields = (el.fieldMappings || '').split(',').map(function(f){return f.trim();});
                displayData = varData.map(function(item) {
                    var row = [];
                    var keys = Object.keys(item);
                    for (var i = 0; i < el.headers.length; i++) {
                        var f = fields[i];
                        if (f && f !== '') {
                            row.push(item[f] !== undefined ? item[f] : '');
                        } else {
                            row.push((keys[i] !== undefined && item[keys[i]] !== undefined) ? item[keys[i]] : '');
                        }
                    }
                    return row;
                });
            }

            var body = [];
            var showH = el.showHeader !== false;
            if (showH) {
                body.push(el.headers.map(function(h,i) {
                    var cellBg = colFills[i] || '';
                    return {
                        text: h,
                        bold: el.headerBold !== false,
                        alignment: pdfHAligns[i] || pdfHAligns[0] || 'center',
                        fillColor: cellBg || undefined
                    };
                }));
            }
            displayData.forEach(function(row, rIdx) {
                body.push(row.map(function(c,i) {
                    var isEvenRow = (rIdx % 2 === 1);
                    var rowBg = isEvenRow ? evenFill : oddFill;
                    var cellBg = colFills[i] || rowBg || '';
                    return {
                        text: c,
                        alignment: pdfBAligns[i] || pdfBAligns[0] || 'left',
                        bold: el.bold || false,
                        italics: el.italic || false,
                        fillColor: cellBg || undefined
                    };
                }));
            });
            var tblLayout = el.showBorder ? {
                hLineWidth: function() { return el.borderWidth||1; },
                vLineWidth: function() { return el.borderWidth||1; },
                hLineColor: function() { return el.borderColor||'#000'; },
                vLineColor: function() { return el.borderColor||'#000'; }
            } : 'noBorders';
            return { table: { headerRows: showH ? 1 : 0, widths: widths, body: body }, layout: tblLayout, fontSize: el.fontSize, color: el.color||'#000' };
        case 'columns':
            return { 
                columns: [
                    { text: el.left, alignment: el.leftAlign || 'left' },
                    { text: el.right, alignment: el.rightAlign || 'left' }
                ], 
                fontSize: el.fontSize, 
                columnGap: 10 
            };
        case 'image':
            if (el.imageSrc) {
                var src = el.imageSrc;
                if (el.dataVar && variables[el.dataVar]) {
                    src = variables[el.dataVar];
                }
                if (src.startsWith('data:image/svg+xml')) {
                    var base64Idx = src.indexOf(';base64,');
                    if (base64Idx !== -1) {
                        var base64Part = src.substring(base64Idx + 8);
                        try {
                            var svgString = decodeURIComponent(escape(atob(base64Part)));
                            return { svg: svgString, width: el.width || 100, height: el.height || 100 };
                        } catch (err) {
                            try {
                                var svgString = atob(base64Part);
                                return { svg: svgString, width: el.width || 100, height: el.height || 100 };
                            } catch (err2) {
                                console.error('SVG decode error:', err2);
                            }
                        }
                    }
                }
                var imgKey = 'img_' + el.id;
                if (imagesDict) {
                    imagesDict[imgKey] = src;
                }
                return { image: imgKey, width: el.width || 100, height: el.height || 100 };
            }
            return { text: '[No image]', fontSize: 11, italics: true };
        case 'panel':
            var children = elements.filter(function(e) { return e.parentId === el.id; });
            var childrenLayout = buildLayout(children, 0, 0, imagesDict, null, variables, elements, pageConfig);
            return {
                stack: [
                    {
                        canvas: [
                            {
                                type: 'rect',
                                x: 0, y: 0,
                                w: el.width,
                                h: el.height,
                                color: el.bgColor || 'transparent',
                                lineWidth: el.borderWidth || 0,
                                lineColor: el.borderColor || 'transparent'
                            }
                        ]
                    },
                    {
                        stack: childrenLayout,
                        margin: [0, -el.height, 0, 0]
                    }
                ]
            };
    }
    return null;
}

function buildLayout(elementsList, baseMarginLeft, baseMarginTop, imagesDict, pageBreakYs, variables, elements, pageConfig) {
    var content = [];
    var layoutElements = elementsList.filter(function(e) {
        return e.type !== 'pagebreak' && isElementVisible(e, variables);
    });
    if (layoutElements.length === 0) return content;

    var activePBs = pageBreakYs ? pageBreakYs.slice() : [];
    var rows = [];
    var sorted = layoutElements.slice().sort(function(a,b) { return a.y - b.y; });
    
    sorted.forEach(function(el) {
        var placed = false;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var avgY = row.reduce(function(sum, e){ return sum + e.y; }, 0) / row.length;
            if (Math.abs(el.y - avgY) < 10) {
                row.push(el);
                placed = true;
                break;
            }
        }
        if (!placed) {
            rows.push([el]);
        }
    });

    rows.sort(function(rowA, rowB) {
        var minY_A = Math.min.apply(null, rowA.map(function(e){ return e.y; }));
        var minY_B = Math.min.apply(null, rowB.map(function(e){ return e.y; }));
        return minY_A - minY_B;
    });

    var prevRowBottom = baseMarginTop;

    rows.forEach(function(row) {
        row.sort(function(a, b) { return a.x - b.x; });
        var currentRowTop = Math.min.apply(null, row.map(function(e){ return e.y; }));
        
        var crossedPB = null;
        if (activePBs.length > 0) {
            for (var i = 0; i < activePBs.length; i++) {
                var pbY = activePBs[i];
                if (prevRowBottom <= pbY && pbY <= currentRowTop) {
                    crossedPB = pbY;
                    activePBs.splice(0, i + 1);
                    break;
                }
            }
        }

        var gapY;
        if (crossedPB !== null) {
            gapY = currentRowTop - crossedPB;
            prevRowBottom = crossedPB;
        } else {
            gapY = currentRowTop - prevRowBottom;
        }
        if (gapY < 0) gapY = 0;

        var currentRowBottom = Math.max.apply(null, row.map(function(e){
            return e.y + getElementHeight(e, variables);
        }));

        var rowNode = null;
        if (row.length === 1) {
            var el = row[0];
            var node = elementToNode(el, imagesDict, variables, elements, pageConfig);
            if (node) {
                var leftMargin = el.x - baseMarginLeft;
                if (el.type === 'shape') {
                    var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                    leftMargin = el.x - rSize.dx - baseMarginLeft;
                }
                var elW = getElementWidth(el, pageConfig);
                if (el.type === 'shape') {
                    var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                    elW = rSize.w;
                }
                var widthVal = el.width;
                if (widthVal && widthVal.toString().indexOf('%') !== -1) {
                    node.width = widthVal.toString().trim();
                } else {
                    node.width = elW;
                }
                rowNode = { columns: [ node ], margin: [leftMargin, gapY, 0, 0] };
            }
        } else {
            var columns = [];
            var firstEl = row[0];
            var colMarginLeft = firstEl.x - baseMarginLeft;
            if (firstEl.type === 'shape') {
                var rSize = getRotatedSize(firstEl.width || 100, firstEl.height || 50, firstEl.rotate || 0);
                colMarginLeft = firstEl.x - rSize.dx - baseMarginLeft;
            }

            var prevEnd = firstEl.x + getElementWidth(firstEl, pageConfig);
            if (firstEl.type === 'shape') {
                var rSize = getRotatedSize(firstEl.width || 100, firstEl.height || 50, firstEl.rotate || 0);
                prevEnd = (firstEl.x - rSize.dx) + rSize.w;
            }

            row.forEach(function(el, idx) {
                var node = elementToNode(el, imagesDict, variables, elements, pageConfig);
                if (node) {
                    var elW = getElementWidth(el, pageConfig);
                    
                    if (idx === 0) {
                        node.margin = [0, 0, 0, 0];
                    } else {
                        var currentStart = el.x;
                        if (el.type === 'shape') {
                            var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                            currentStart = el.x - rSize.dx;
                        }
                        var gap = currentStart - prevEnd;
                        if (gap < 0) gap = 0;
                        node.margin = [gap, 0, 0, 0];
                    }
                    
                    var currentWidth = elW;
                    if (el.type === 'shape') {
                        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                        currentWidth = rSize.w;
                    }
                    prevEnd = (el.type === 'shape' ? (el.x - rSize.dx) : el.x) + currentWidth;
                    
                    var widthVal = el.width;
                    if (widthVal && widthVal.toString().indexOf('%') !== -1) {
                        node.width = widthVal.toString().trim();
                    } else {
                        node.width = elW;
                    }
                    
                    columns.push(node);
                }
            });
            
            rowNode = { columns: columns, margin: [colMarginLeft, gapY, 0, 0] };
        }

        if (rowNode) {
            if (crossedPB !== null) {
                rowNode.pageBreak = 'before';
            }
            content.push(rowNode);
        }

        prevRowBottom = currentRowBottom;
    });

    return content;
}

/**
 * Create pdfmake Document Definition from JSON template and dynamic variables.
 */
export function buildDocDefinition(templateJson, dynamicVariables) {
    var elements = templateJson.elements || [];
    var pageConfig = templateJson.pageConfig || {
        bgColor: '#ffffff',
        marginLeft: 20,
        marginTop: 20,
        marginRight: 20,
        marginBottom: 20,
        defaultFont: 'Roboto',
        paperSize: 'LETTER',
        paperOrient: 'portrait'
    };
    
    var combinedVariables = Object.assign({}, templateJson.variables, dynamicVariables);
    var imagesDict = {};
    
    var pageBreaks = elements.filter(function(e) { return e.type === 'pagebreak'; }).sort(function(a,b) { return a.y - b.y; });
    var pageBreakYs = pageBreaks.map(function(pb) { return pb.y; });
    
    var topLevelElements = elements.filter(function(e) { return !e.parentId; });
    
    var content = buildLayout(topLevelElements, pageConfig.marginLeft, pageConfig.marginTop, imagesDict, pageBreakYs, combinedVariables, elements, pageConfig);
    
    return {
        pageSize: pageConfig.paperSize || 'LETTER',
        pageOrientation: pageConfig.paperOrient || 'portrait',
        pageMargins: [pageConfig.marginLeft, pageConfig.marginTop, pageConfig.marginRight, pageConfig.marginBottom],
        defaultStyle: { font: pageConfig.defaultFont === 'Times New Roman' ? 'TimesNewRoman' : 'Roboto' },
        background: function(currentPage, pageSize) {
            return {
                canvas: [
                    {
                        type: 'rect',
                        x: 0, y: 0,
                        w: pageSize.width,
                        h: pageSize.height,
                        color: pageConfig.bgColor || '#ffffff'
                    }
                ]
            };
        },
        content: content,
        images: imagesDict
    };
}

/**
 * Export and download PDF file directly on the browser.
 */
export function generatePDF(templateJson, dynamicVariables, fileName = 'report.pdf') {
    var docDefinition = buildDocDefinition(templateJson, dynamicVariables);
    pdfMake.createPdf(docDefinition).download(fileName);
}
