import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { TimesNewRomanFonts } from './timesNewRomanFonts';

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

function parseFieldMappings(el) {
    var raw = el.fieldMappings || '';
    if (!raw) return el.headers.map(function() { return ''; });
    var sep = raw.indexOf('||') !== -1 ? '||' : ',';
    var parts = raw.split(sep).map(function(s) { return s.trim(); });
    while (parts.length < el.headers.length) parts.push('');
    return parts;
}

function resolveFieldValue(mapping, item, index, variables) {
    if (!mapping || mapping === '') return undefined;
    if (mapping.indexOf('fx:') === 0) {
        var expr = mapping.substring(3);
        try {
            var fn = new Function('$item', '$index', '$data', /\breturn\b/.test(expr) ? expr : 'return (' + expr + ')');
            var res = fn(item, index, variables);
            return res !== undefined && res !== null ? res : '';
        } catch (e) {
            return 'Fx Error: ' + e.message;
        }
    }
    return (item[mapping] !== undefined && item[mapping] !== null) ? item[mapping] : '';
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
    if (el.type === 'text' || el.type === 'var' || el.type === 'shape' || el.type === 'image' || el.type === 'panel' || el.type === 'emptyline') {
        var w = getParsedWidth(el.width, pageConfig) || 100;
        return (el.type === 'text' || el.type === 'var') ? Math.max(20, w) : w;
    }
    if (el.type === 'line') {
        return getParsedWidth(el.lineWidth, pageConfig) || 100;
    }
    if (el.type === 'rect') {
        return getParsedWidth(el.rectW, pageConfig) || 100;
    }
    return 100;
}

function getElementHeight(el, variables, pageConfig) {
    if (el.type === 'shape') {
        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
        return rSize.h;
    }
    if (el.type === 'image' && el.rotate) {
        var rSize = getRotatedSize(getParsedWidth(el.width, pageConfig) || 100, el.height || 100, el.rotate || 0);
        return rSize.h;
    }
    if (el.type === 'rect') return el.rectH || 20;
    if (el.type === 'emptyline') return parseFloat(el.height) || 20;
    if (el.type === 'line') return el.lineWeight || 1;
    if (el.type === 'text' || el.type === 'var') return Math.ceil((el.fontSize || 13) * 1.15);
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

function getElementEffectiveFont(fontName) {
    if (!fontName) return undefined;
    if (fontName === 'Roboto') return 'Roboto';
    if (typeof pdfMake !== 'undefined' && pdfMake.fonts) {
        if (pdfMake.fonts[fontName]) return fontName;
        
        var normalizedTarget = fontName.toLowerCase().replace(/[\s_-]/g, '');
        for (var key in pdfMake.fonts) {
            if (pdfMake.fonts.hasOwnProperty(key)) {
                var normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
                if (normalizedKey === normalizedTarget) {
                    return key;
                }
            }
        }
    }
    return undefined;
}

// Convert HTML tags (b, i, u) in text to pdfmake rich text array
function parseHtmlToPdfText(str) {
    str = String(str);
    if (str.indexOf('<') === -1) return str; // no tags, return plain string
    var result = [];
    var regex = /<(\/?)([biu])>/gi;
    var lastIdx = 0;
    var bold = false, italic = false, underline = false;
    var match;
    while ((match = regex.exec(str)) !== null) {
        if (match.index > lastIdx) {
            var seg = str.substring(lastIdx, match.index);
            if (seg) {
                var obj = { text: seg };
                if (bold) obj.bold = true;
                if (italic) obj.italics = true;
                if (underline) obj.decoration = 'underline';
                result.push(obj);
            }
        }
        var isClose = match[1] === '/';
        var tag = match[2].toLowerCase();
        if (tag === 'b') bold = !isClose;
        else if (tag === 'i') italic = !isClose;
        else if (tag === 'u') underline = !isClose;
        lastIdx = regex.lastIndex;
    }
    if (lastIdx < str.length) {
        var remaining = str.substring(lastIdx);
        if (remaining) {
            var obj = { text: remaining };
            if (bold) obj.bold = true;
            if (italic) obj.italics = true;
            if (underline) obj.decoration = 'underline';
            result.push(obj);
        }
    }
    return result.length === 1 && !result[0].bold && !result[0].italics && !result[0].decoration ? result[0].text : result;
}

function elementToNode(el, imagesDict, variables, elements, pageConfig) {
    switch(el.type) {
        case 'text':
            var displayText = el.text;
            if (el.isFx) {
                displayText = el.fxExpr ? evaluateFx(el.fxExpr, variables) : '';
            }
            if (displayText === null || displayText === undefined) {
                displayText = '';
            }
            var textColor = el.color;
            if (el.isColorFx && el.colorFx) {
                var evaluatedColor = evaluateFx(el.colorFx, variables);
                if (evaluatedColor && !evaluatedColor.startsWith('Fx Error:')) {
                    textColor = evaluatedColor;
                }
            }
            return { text: parseHtmlToPdfText(displayText), fontSize: el.fontSize, bold: el.bold, italics: el.italic, alignment: el.align, color: textColor, width: el.width, noWrap: el.wrap === false ? true : undefined, font: getElementEffectiveFont(el.font) };
        case 'var':
            var displayVal = '';
            if (el.isFx) {
                displayVal = el.fxExpr ? evaluateFx(el.fxExpr, variables) : '';
            } else {
                displayVal = (variables[el.varName] !== undefined && variables[el.varName] !== null) ? variables[el.varName] : '';
            }
            if (displayVal === null || displayVal === undefined) {
                displayVal = '';
            }
            var val = (el.prefix||'') + displayVal;
            var textColor = el.color || '#000000';
            if (el.isColorFx && el.colorFx) {
                var evaluatedColor = evaluateFx(el.colorFx, variables);
                if (evaluatedColor && !evaluatedColor.startsWith('Fx Error:')) {
                    textColor = evaluatedColor;
                }
            }
            return { text: parseHtmlToPdfText(val), fontSize: el.fontSize, bold: el.bold, italics: el.italic, alignment: el.align, color: textColor, width: el.width, noWrap: el.wrap === false ? true : undefined, font: getElementEffectiveFont(el.font) };
        case 'line':
            return { canvas: [{ type:'line', x1:0, y1:0, x2:getParsedWidth(el.lineWidth, pageConfig), y2:0, lineWidth:parseFloat(el.lineWeight) || 1, lineColor:el.color }] };
        case 'emptyline':
            return { text: ' ', fontSize: 1, margin: [0, 0, 0, (parseFloat(el.height) || 20)] };
        case 'rect':
            return { canvas: [{ type:'rect', x:0, y:0, w:getParsedWidth(el.rectW, pageConfig), h:parseFloat(el.rectH) || 20, r:parseFloat(el.radius) || 0, lineWidth:parseFloat(el.lineWeight) || 0, lineColor:el.color, color:el.fillColor||undefined }] };
        case 'shape':
            var shW = getParsedWidth(el.width, pageConfig);
            var shH = parseFloat(el.height) || 50;
            var shType = el.shapeType || 'rect';
            var shBdrW = parseFloat(el.lineWidth) || 1;
            var shBdrC = el.color || '#000000';
            var shFill = el.fillColor || 'none';
            var angle = parseFloat(el.rotate) || 0;
            
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
            var parsedWidths = (el.widths || '').split(',').map(function(w) { return w.trim(); });
            var widths = [];
            for (var i = 0; i < el.headers.length; i++) {
                var w = parsedWidths[i] || '*';
                if (w === '') w = '*';
                if (w.indexOf('%') !== -1) {
                    var pct = parseFloat(w) || 0;
                    widths.push(Math.round((pct / 100) * tableW));
                } else {
                    widths.push(isNaN(w) ? w : +w);
                }
            }
            var pdfHAligns = (el.headerAligns||'center').split(',').map(function(a){return a.trim();});
            var pdfBAligns = (el.bodyAligns||'left').split(',').map(function(a){return a.trim();});
            var colFills = (el.colFills || '').split(',').map(function(f){return f.trim();});
            var colColors = (el.colColors || '').split(',').map(function(c){return c.trim();});
            
            var headerBolds = [];
            if (el.headerBolds) {
                headerBolds = el.headerBolds.split(',').map(function(b){return b.trim() === 'true';});
            } else {
                var hB = el.headerBold !== false;
                for (var i = 0; i < el.headers.length; i++) {
                    headerBolds.push(hB);
                }
            }

            var oddFill = el.oddRowFill || '';
            var evenFill = el.evenRowFill || '';
            
            var displayData = el.data || [];
            if (el.dataVar && Array.isArray(variables[el.dataVar])) {
                var varData = variables[el.dataVar];
                var fields = parseFieldMappings(el);
                displayData = varData.map(function(item, rIdx) {
                    var row = [];
                    var keys = Object.keys(item);
                    for (var i = 0; i < el.headers.length; i++) {
                        var resolved = resolveFieldValue(fields[i], item, rIdx, variables);
                        if (resolved !== undefined && resolved !== null) {
                            row.push(resolved);
                        } else {
                            var rawVal = (keys[i] !== undefined) ? item[keys[i]] : undefined;
                            row.push((rawVal !== undefined && rawVal !== null) ? rawVal : '');
                        }
                    }
                    return row;
                });
            }

            var cellBorder = el.showBorder ? [
                el.borderLeft !== false,
                el.borderTop !== false,
                el.borderRight !== false,
                el.borderBottom !== false
            ] : undefined;
            var body = [];
            var showH = el.showHeader !== false;
            if (showH) {
                body.push(el.headers.map(function(h,i) {
                    var cellBg = colFills[i] || '';
                    var hBoldVal = headerBolds[i] !== undefined ? headerBolds[i] : (el.headerBold !== false);
                    var cellColor = colColors[i] || el.color || '#000000';
                    return {
                        text: h,
                        bold: hBoldVal,
                        alignment: pdfHAligns[i] || pdfHAligns[0] || 'center',
                        fillColor: cellBg || undefined,
                        color: cellColor || undefined,
                        border: cellBorder
                    };
                }));
            }
            displayData.forEach(function(row, rIdx) {
                if (!Array.isArray(row)) return;
                var safeRow = [];
                for (var i = 0; i < widths.length; i++) {
                    var cellVal = row[i] !== undefined ? row[i] : '';
                    var isEvenRow = (rIdx % 2 === 1);
                    var rowBg = isEvenRow ? evenFill : oddFill;
                    var cellBg = colFills[i] || rowBg || '';
                    var cellColor = colColors[i] || el.color || '#000000';
                    safeRow.push({
                        text: parseHtmlToPdfText(cellVal),
                        alignment: pdfBAligns[i] || pdfBAligns[0] || 'left',
                        bold: el.bold || false,
                        italics: el.italic || false,
                        fillColor: cellBg || undefined,
                        color: cellColor || undefined,
                        border: cellBorder
                    });
                }
                body.push(safeRow);
            });
            var tblLayout = el.showBorder ? {
                hLineWidth: function() { return el.borderWidth||1; },
                vLineWidth: function() { return el.borderWidth||1; },
                hLineColor: function() { return el.borderColor||'#000'; },
                vLineColor: function() { return el.borderColor||'#000'; }
            } : 'noBorders';
            return { table: { headerRows: showH ? 1 : 0, widths: widths, body: body }, layout: tblLayout, fontSize: el.fontSize, color: el.color||'#000', font: getElementEffectiveFont(el.font) };
        case 'image':
            if (el.imageSrc) {
                var src = el.imageSrc;
                if (el.dataVar && variables[el.dataVar]) {
                    src = variables[el.dataVar];
                }
                var imgW = getParsedWidth(el.width, pageConfig);
                var imgH = parseFloat(el.height) || 100;
                var angle = parseFloat(el.rotate) || 0;

                if (angle !== 0) {
                    var rSize = getRotatedSize(imgW, imgH, angle);
                    var svgStr = '<svg width="'+rSize.w+'" height="'+rSize.h+'" viewBox="0 0 '+rSize.w+' '+rSize.h+'" xmlns="http://www.w3.org/2000/svg">';
                    svgStr += '<g transform="translate('+(rSize.w/2)+' '+(rSize.h/2)+') rotate('+angle+') translate('+(-imgW/2)+' '+(-imgH/2)+')">';
                    svgStr += '<image href="'+src+'" xlink:href="'+src+'" width="'+imgW+'" height="'+imgH+'" />';
                    svgStr += '</g></svg>';
                    return { svg: svgStr, width: rSize.w, height: rSize.h };
                }

                if (src.startsWith('data:image/svg+xml')) {
                    var base64Idx = src.indexOf(';base64,');
                    if (base64Idx !== -1) {
                        var base64Part = src.substring(base64Idx + 8);
                        try {
                            var svgString = decodeURIComponent(escape(atob(base64Part)));
                            return { svg: svgString, width: imgW, height: imgH };
                        } catch (err) {
                            try {
                                var svgString = atob(base64Part);
                                return { svg: svgString, width: imgW, height: imgH };
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
                return { image: imgKey, width: imgW, height: imgH };
            }
            return { text: '[No image]', fontSize: 11, italics: true };
        case 'panel':
            var children = elements.filter(function(e) { return e.parentId === el.id; });
            var childrenLayout = [];
            children.forEach(function(child) {
                if (!isElementVisible(child, variables)) return;
                var node = elementToNode(child, imagesDict, variables, elements, pageConfig);
                if (node) {
                    var x = child.x || 0;
                    var y = child.y || 0;
                    var w = getElementWidth(child, pageConfig);
                    
                    if (child.type === 'shape') {
                        var rSize = getRotatedSize(child.width || 100, child.height || 50, child.rotate || 0);
                        x = x - rSize.dx;
                        y = y - rSize.dy;
                        w = rSize.w;
                    } else if (child.type === 'image' && child.rotate) {
                        var rSize = getRotatedSize(getParsedWidth(child.width, pageConfig) || 100, child.height || 100, child.rotate || 0);
                        x = x - rSize.dx;
                        y = y - rSize.dy;
                        w = rSize.w;
                    }
                    
                    var wrappedNode = {
                        columns: [
                            {
                                width: w,
                                stack: [ node ]
                            }
                        ],
                        relativePosition: { x: x, y: y }
                    };
                    childrenLayout.push(wrappedNode);
                }
            });
            var panelH = parseFloat(el.height) || 150;
            return {
                stack: [
                    {
                        canvas: [
                            {
                                type: 'rect',
                                x: 0, y: 0,
                                w: getParsedWidth(el.width, pageConfig),
                                h: panelH,
                                color: el.bgColor || 'transparent',
                                lineWidth: parseFloat(el.borderWidth) || 0,
                                lineColor: el.borderColor || 'transparent'
                            }
                        ]
                    },
                    {
                        stack: childrenLayout,
                        margin: [0, -panelH, 0, 0]
                    }
                ]
            };
    }
    return null;
}

function buildLayout(elementsList, baseMarginLeft, baseMarginTop, imagesDict, pageBreakYs, variables, elements, pageConfig) {
    function horizontalOverlap(el1, el2) {
        var w1 = getElementWidth(el1, pageConfig);
        var w2 = getElementWidth(el2, pageConfig);
        var x1 = el1.x;
        var x2 = el2.x;
        var intersection = Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2);
        if (intersection <= 0) return false;
        var minW = Math.min(w1, w2);
        if (isNaN(minW) || minW <= 0) return false;
        return (intersection / minW) > 0.5;
    }
    function verticalOverlap(el1, el2) {
        var h1 = getElementHeight(el1, variables, pageConfig);
        var h2 = getElementHeight(el2, variables, pageConfig);
        var y1 = el1.y;
        var y2 = el2.y;
        var intersection = Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2);
        return intersection > 0;
    }
    function isOverlayingShape(el) {
        if (el.type === 'shape' || el.type === 'rect' || el.type === 'line') return false;
        for (var i = 0; i < layoutElements.length; i++) {
            var other = layoutElements[i];
            if (other.id === el.id) continue;
            if (other.type === 'shape' || other.type === 'rect' || other.type === 'line') {
                if (horizontalOverlap(el, other) && verticalOverlap(el, other)) {
                    return true;
                }
            }
        }
        return false;
    }
    var content = [];
    var layoutElements = elementsList.filter(function(e) {
        return e.type !== 'pagebreak' && isElementVisible(e, variables);
    });
    if (layoutElements.length === 0) return content;

    var activePBs = pageBreakYs ? pageBreakYs.slice() : [];
    
    // Group elements into rows based on Y coordinate
    var rows = [];
    var sorted = layoutElements.slice().sort(function(a,b) { return a.y - b.y; });
    
    sorted.forEach(function(el) {
        var placed = false;
        var isShapeOrOverlay = el.type === 'shape' || el.type === 'rect' || el.type === 'line' || isOverlayingShape(el);
        if (!isShapeOrOverlay) {
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var hasShapeOrOverlay = row.some(function(rEl) {
                    return rEl.type === 'shape' || rEl.type === 'rect' || rEl.type === 'line' || isOverlayingShape(rEl);
                });
                if (hasShapeOrOverlay) continue;
                var avgY = row.reduce(function(sum, e){ return sum + e.y; }, 0) / row.length;
                if (Math.abs(el.y - avgY) < 10) {
                    var overlaps = false;
                    for (var j = 0; j < row.length; j++) {
                        if (horizontalOverlap(el, row[j])) {
                            overlaps = true;
                            break;
                        }
                    }
                    if (!overlaps) {
                        row.push(el);
                        placed = true;
                        break;
                    }
                }
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
    var renderedElements = []; // Store { el, absoluteRenderedBottom }

    rows.forEach(function(row) {
        row.sort(function(a, b) { return a.x - b.x; });
        
        var paperSize = pageConfig.paperSize || 'LETTER';
        var paperOrient = pageConfig.paperOrient || 'portrait';
        var sizes = { LETTER:[612,792], A4:[595,842], A5:[420,595], LEGAL:[612,1008] };
        var s = sizes[paperSize] || sizes.LETTER;
        var pageWidth = (paperOrient === 'landscape' ? s[1] : s[0]);
        var rightMargin = pageConfig.marginRight || 0;

        var currentRowTop = Math.min.apply(null, row.map(function(e){ return e.y; }));
        
        // Calculate the minimum Y position for this row to avoid horizontal overlaps
        var minRowY = baseMarginTop;
        row.forEach(function(el) {
            renderedElements.forEach(function(prev) {
                if (horizontalOverlap(el, prev.el)) {
                    // Skip overlap restriction if either is a shape, rect, line, or overlay
                    if (el.type === 'shape' || el.type === 'rect' || el.type === 'line' || isOverlayingShape(el) ||
                        prev.el.type === 'shape' || prev.el.type === 'rect' || prev.el.type === 'line' || isOverlayingShape(prev.el)) {
                        return;
                    }
                    var elOffsetY = el.y - currentRowTop;
                    minRowY = Math.max(minRowY, prev.absoluteRenderedBottom - elOffsetY);
                }
            });
        });

        var targetRowTop = Math.max(currentRowTop, minRowY);

        var crossedPB = null;
        if (activePBs.length > 0) {
            for (var i = 0; i < activePBs.length; i++) {
                var pbY = activePBs[i];
                if (prevRowBottom <= pbY && pbY <= targetRowTop) {
                    crossedPB = pbY;
                    activePBs.splice(0, i + 1);
                    break;
                }
            }
        }

        var gapY;
        if (crossedPB !== null) {
            gapY = targetRowTop - crossedPB;
            prevRowBottom = crossedPB;
        } else {
            gapY = targetRowTop - prevRowBottom;
        }
        if (gapY < 0) {
            if (crossedPB !== null) {
                gapY = 0;
            }
        }

        var absoluteRowTop = prevRowBottom + gapY;

        var currentRowBottom = absoluteRowTop;
        var isRelativeRow = row.some(function(e) {
            return e.type === 'shape' || e.type === 'rect' || e.type === 'line' || isOverlayingShape(e);
        });

        row.forEach(function(el) {
            var elHeight = getElementHeight(el, variables, pageConfig);
            var elOffsetY = el.y - currentRowTop;
            var elBottom = absoluteRowTop + elOffsetY + elHeight;
            renderedElements.push({ el: el, absoluteRenderedBottom: elBottom });
            if (!isRelativeRow) {
                if (elBottom > currentRowBottom) {
                    currentRowBottom = elBottom;
                }
            }
        });

        var rowNode = null;
        if (row.length === 1) {
            var el = row[0];
            var node = elementToNode(el, imagesDict, variables, elements, pageConfig);
            if (node) {
                var leftMargin = el.x - baseMarginLeft;
                if (el.type === 'shape') {
                    var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                    leftMargin = el.x - rSize.dx - baseMarginLeft;
                } else if (el.type === 'image' && el.rotate) {
                    var rSize = getRotatedSize(getParsedWidth(el.width, pageConfig) || 100, el.height || 100, el.rotate || 0);
                    leftMargin = el.x - rSize.dx - baseMarginLeft;
                }
                var elW = getElementWidth(el, pageConfig);
                if (el.type === 'shape') {
                    var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                    elW = rSize.w;
                } else if (el.type === 'image' && el.rotate) {
                    var rSize = getRotatedSize(getParsedWidth(el.width, pageConfig) || 100, el.height || 100, el.rotate || 0);
                    elW = rSize.w;
                }
                var maxAllowedW = pageWidth - rightMargin - el.x;
                if (el.type === 'shape') {
                    var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                    maxAllowedW = pageWidth - rightMargin - (el.x - rSize.dx);
                } else if (el.type === 'image' && el.rotate) {
                    var rSize = getRotatedSize(getParsedWidth(el.width, pageConfig) || 100, el.height || 100, el.rotate || 0);
                    maxAllowedW = pageWidth - rightMargin - (el.x - rSize.dx);
                }
                var clampedW = Math.max(10, Math.min(elW, maxAllowedW));
                var colNode = {
                    width: clampedW,
                    stack: [ node ]
                };
                if (isRelativeRow) {
                    rowNode = { columns: [ colNode ], relativePosition: { x: leftMargin, y: gapY } };
                } else {
                    rowNode = { columns: [ colNode ], margin: [leftMargin, gapY, 0, 0] };
                }
            }
        } else {
            var columns = [];
            var firstEl = row[0];
            var colMarginLeft = firstEl.x - baseMarginLeft;
            var firstRSize = null;
            if (firstEl.type === 'shape') {
                firstRSize = getRotatedSize(firstEl.width || 100, firstEl.height || 50, firstEl.rotate || 0);
                colMarginLeft = firstEl.x - firstRSize.dx - baseMarginLeft;
            } else if (firstEl.type === 'image' && firstEl.rotate) {
                firstRSize = getRotatedSize(getParsedWidth(firstEl.width, pageConfig) || 100, firstEl.height || 100, firstEl.rotate || 0);
                colMarginLeft = firstEl.x - firstRSize.dx - baseMarginLeft;
            }

            var prevEnd = (firstRSize ? (firstEl.x - firstRSize.dx) : firstEl.x);

            row.forEach(function(el, idx) {
                var node = elementToNode(el, imagesDict, variables, elements, pageConfig);
                if (node) {
                    var elW = getElementWidth(el, pageConfig);
                    if (el.type === 'shape') {
                        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                        elW = rSize.w;
                    } else if (el.type === 'image' && el.rotate) {
                        var rSize = getRotatedSize(getParsedWidth(el.width, pageConfig) || 100, el.height || 100, el.rotate || 0);
                        elW = rSize.w;
                    }
                    
                    var maxAllowedW = pageWidth - rightMargin - el.x;
                    if (el.type === 'shape') {
                        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                        maxAllowedW = pageWidth - rightMargin - (el.x - rSize.dx);
                    } else if (el.type === 'image' && el.rotate) {
                        var rSize = getRotatedSize(getParsedWidth(el.width, pageConfig) || 100, el.height || 100, el.rotate || 0);
                        maxAllowedW = pageWidth - rightMargin - (el.x - rSize.dx);
                    }
                    var clampedW = Math.max(10, Math.min(elW, maxAllowedW));

                    var currentStart = el.x;
                    if (el.type === 'shape') {
                        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                        currentStart = el.x - rSize.dx;
                    } else if (el.type === 'image' && el.rotate) {
                        var rSize = getRotatedSize(getParsedWidth(el.width, pageConfig) || 100, el.height || 100, el.rotate || 0);
                        currentStart = el.x - rSize.dx;
                    }
                    var gap = currentStart - prevEnd;
                    if (gap > 0) {
                        columns.push({ width: gap, text: '' });
                    }

                    // Vertical offset: align element relative to row top
                    var elOffsetY = el.y - currentRowTop;
                    if (elOffsetY > 0) {
                        node.margin = [0, elOffsetY, 0, 0];
                    }

                    var colNode = {
                        width: clampedW,
                        stack: [ node ]
                    };
                    
                    columns.push(colNode);
                    prevEnd = currentStart + clampedW;
                }
            });
            
            rowNode = { columns: columns, columnGap: 0, margin: [colMarginLeft, gapY, 0, 0] };
        }

        if (rowNode) {
            if (crossedPB !== null) {
                rowNode.pageBreak = 'before';
            }
            content.push(rowNode);
        }

        if (!isRelativeRow) {
            prevRowBottom = currentRowBottom;
        }
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
    
    // Register custom fonts into pdfMake vfs and fonts if present
    if (typeof pdfMake !== 'undefined') {
        if (!pdfMake.fonts) {
            pdfMake.fonts = {
                Roboto: {
                    normal: 'Roboto-Regular.ttf',
                    bold: 'Roboto-Medium.ttf',
                    italics: 'Roboto-Italic.ttf',
                    bolditalics: 'Roboto-MediumItalic.ttf'
                }
            };
        }
        if (pdfMake.vfs) {
            pdfMake.vfs['SVN-Times-New-Roman.ttf'] = TimesNewRomanFonts.normal;
            pdfMake.vfs['SVN-Times-New-Roman-Bold.ttf'] = TimesNewRomanFonts.bold;
            pdfMake.vfs['SVN-Times-New-Roman-Italic.ttf'] = TimesNewRomanFonts.italics;
            pdfMake.vfs['SVN-Times-New-Roman-BoldItalic.ttf'] = TimesNewRomanFonts.bolditalics;
        }
        var timesNewRomanDef = {
            normal: 'SVN-Times-New-Roman.ttf',
            bold: 'SVN-Times-New-Roman-Bold.ttf',
            italics: 'SVN-Times-New-Roman-Italic.ttf',
            bolditalics: 'SVN-Times-New-Roman-BoldItalic.ttf'
        };
        pdfMake.fonts['Times New Roman'] = timesNewRomanDef;
        pdfMake.fonts['TimesNewRoman'] = timesNewRomanDef;

        if (pageConfig.customFonts && Array.isArray(pageConfig.customFonts)) {
            pageConfig.customFonts.forEach(function(font) {
                var normalFile = font.name + '-Regular.ttf';
                var boldFile = font.bold ? font.name + '-Bold.ttf' : normalFile;
                var italicFile = font.italics ? font.name + '-Italic.ttf' : normalFile;
                var boldItalicFile = font.bolditalics ? font.name + '-BoldItalic.ttf' : (font.bold ? font.name + '-Bold.ttf' : normalFile);
                
                if (pdfMake.vfs) {
                    pdfMake.vfs[normalFile] = font.normal;
                    if (font.bold) pdfMake.vfs[boldFile] = font.bold;
                    if (font.italics) pdfMake.vfs[italicFile] = font.italics;
                    if (font.bolditalics) pdfMake.vfs[boldItalicFile] = font.bolditalics;
                }
                
                pdfMake.fonts[font.name] = {
                    normal: normalFile,
                    bold: boldFile,
                    italics: italicFile,
                    bolditalics: boldItalicFile
                };
            });
        }
    }

    var fontName = 'Roboto';
    if (pageConfig.defaultFont && typeof pdfMake !== 'undefined' && pdfMake.fonts && pdfMake.fonts[pageConfig.defaultFont]) {
        fontName = pageConfig.defaultFont;
    } else if (pageConfig.defaultFont === 'Times New Roman' && typeof pdfMake !== 'undefined' && pdfMake.fonts) {
        if (pdfMake.fonts['Times New Roman']) fontName = 'Times New Roman';
        else if (pdfMake.fonts['TimesNewRoman']) fontName = 'TimesNewRoman';
    }

    return {
        pageSize: pageConfig.paperSize || 'LETTER',
        pageOrientation: pageConfig.paperOrient || 'portrait',
        pageMargins: [pageConfig.marginLeft, pageConfig.marginTop, pageConfig.marginRight, pageConfig.marginBottom],
        defaultStyle: { font: fontName },
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

/**
 * Print PDF directly on the browser.
 */
export function printPDF(templateJson, dynamicVariables) {
    var docDefinition = buildDocDefinition(templateJson, dynamicVariables);
    pdfMake.createPdf(docDefinition).print();
}
