// ============================================================
// STATE
// ============================================================
var elements = [];
var selectedId = null;
var selectedIds = [];
var idCounter = 0;
var undoStack = [];
var undoMaxSize = 50;
var clipboard = [];
var lastClickTime = 0;
var lastClickedId = null;

function blurActivePropertyInput() {
    var active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        var props = document.getElementById('propsContent');
        if (props && props.contains(active)) {
            active.blur();
        }
    }
}
function saveUndo() {
    blurActivePropertyInput();
    undoStack.push(JSON.stringify(elements));
    if (undoStack.length > undoMaxSize) undoStack.shift();
}
function undo() {
    if (undoStack.length === 0) return;
    var snapshot = JSON.parse(undoStack.pop());
    elements = snapshot;
    var maxId = 0;
    elements.forEach(function(el) { if (el.id > maxId) maxId = el.id; });
    idCounter = maxId;
    selectedId = null;
    selectedIds = [];
    updateAlignToolbar();
    render();
    renderProps();
    renderOutline();
}
var pageConfig = {
    bgColor: '#ffffff',
    marginLeft: 20,
    marginTop: 20,
    marginRight: 20,
    marginBottom: 20,
    defaultFont: 'Times New Roman',
    paperSize: 'LETTER',
    paperOrient: 'portrait'
};
var variables = {
    clinic_name: "Clinic Name",
    clinic_phone: "0123456789",
    ticket_number: "12381/1251",
    medical_id: "1238/125",
    clinic_logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAADFLCArAAAAA1BMVEUzMzMrj16bAAAAR0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3wA7gAAB6PpYEwAAAABJRU5ErkJggg==",
    patient_name: "JOHN SMITH",
    patient_age: "35",
    patient_gender: "Male",
    patient_address: "123 Main Street, New York",
    diagnosis: "Acute Pharyngitis",
    doctor_name: "Dr. Jane Doe",
    medications: [
        { no: 1, name: "Paracetamol 500mg", quantity: 10, unit: "Tablet", usage: "Take after meals, 1 morning 1 night" },
        { no: 2, name: "Amoxicillin 500mg", quantity: 14, unit: "Tablet", usage: "Take after meals, 1 morning 1 night" },
        { no: 3, name: "Decolgen Forte", quantity: 4, unit: "Tablet", usage: "Take when feverish/sneezing" }
    ]
};
var dragState = null;
var isLivePreviewOn = false;
var livePreviewTimeout = null;
var currentActiveFrame = 1;
var activeBlobUrl = null;

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

function getParsedWidth(widthVal) {
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

function horizontalOverlap(el1, el2) {
    var w1 = getElementWidth(el1);
    var w2 = getElementWidth(el2);
    var x1 = el1.x;
    var x2 = el2.x;
    var intersection = Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2);
    if (intersection <= 0) return false;
    var minW = Math.min(w1, w2);
    if (isNaN(minW) || minW <= 0) return false;
    return (intersection / minW) > 0.5;
}

function verticalOverlap(el1, el2) {
    var h1 = getElementHeight(el1, variables);
    var h2 = getElementHeight(el2, variables);
    var y1 = el1.y;
    var y2 = el2.y;
    var intersection = Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2);
    return intersection > 0;
}

function isOverlayingShape(el, elementsList) {
    if (el.type === 'shape' || el.type === 'rect' || el.type === 'line') return false;
    var list = elementsList || elements;
    for (var i = 0; i < list.length; i++) {
        var other = list[i];
        if (other.id === el.id) continue;
        if (other.type === 'shape' || other.type === 'rect' || other.type === 'line') {
            if (horizontalOverlap(el, other) && verticalOverlap(el, other)) {
                return true;
            }
        }
    }
    return false;
}

// ============================================================
// ELEMENT MANAGEMENT
// ============================================================
function addElement(type) {
    saveUndo();
    var el = { id: ++idCounter, x: 20, y: 20 + elements.length * 24, parentId: null, showFx: '', useShowFx: false, isColorFx: false, colorFx: '' };
    switch(type) {
        case 'text':
            Object.assign(el, { type:'text', text:'New Text', fontSize:13, bold:false, italic:false, align:'left', color:'#000000', width:200, wrap:false, isFx:false, fxExpr:'' });
            break;
        case 'heading':
            Object.assign(el, { type:'text', text:'TITLE', fontSize:18, bold:true, italic:false, align:'center', color:'#000000', width:572, wrap:false });
            el.x = 20;
            break;
        case 'line':
            Object.assign(el, { type:'line', lineWidth:550, lineWeight:1, color:'#000000' });
            break;
        case 'rect':
            Object.assign(el, { type:'rect', rectW:100, rectH:20, radius:0, lineWeight:0.5, color:'#000000', fillColor:'' });
            break;
        case 'shape':
            Object.assign(el, { type:'shape', shapeType:'rect', width:100, height:50, lineWidth:1, color:'#000000', fillColor:'', radius:0, points:'0,50 50,0 100,50', close:true });
            break;
        case 'table':
            Object.assign(el, { type:'table', cols:3, rows:2, headers:['Column 1','Column 2','Column 3'], data:[['a','b','c']], widths:'*,*,*', fontSize:12, width:500, borderWidth:1, borderColor:'#000000', showBorder:true, borderLeft:true, borderTop:true, borderRight:true, borderBottom:true, showHeader:true, headerAligns:'center,center,center', bodyAligns:'left,left,left', headerBold:true, bold:false, italic:false, color:'#000000', dataVar:'', fieldMappings:'', colFills:'', oddRowFill:'', evenRowFill:'', colColors:'', headerBolds:'', paddingTop:4, paddingBottom:4, paddingLeft:6, paddingRight:6, borderStyle:'solid' });
            break;
        case 'var':
            var key = Object.keys(variables)[0] || 'patient_name';
            Object.assign(el, { type:'var', varName:key, fontSize:13, bold:false, italic:false, align:'left', color:'#000000', prefix:'', width:200, isFx:false, fxExpr:'' });
            break;
        case 'image':
            Object.assign(el, { type:'image', imageSrc:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAADFLCArAAAAA1BMVEUzMzMrj16bAAAAR0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3wA7gAAB6PpYEwAAAABJRU5ErkJggg==', width:100, height:100, rotate:0 });
            break;
        case 'panel':
            Object.assign(el, { type:'panel', width:200, height:150, bgColor:'#ffffff', borderColor:'#ffffff', borderWidth:1 });
            break;
        case 'pagebreak':
            Object.assign(el, { type:'pagebreak', width:'100%', height:20 });
            el.x = 0;
            break;
        case 'emptyline':
            Object.assign(el, { type:'emptyline', height:20, width:'100%' });
            el.x = 0;
            break;
    }
    elements.push(el);
    selectElement(el.id);
    render();
}

function deleteElement(id) {
    saveUndo();
    elements = elements.filter(function(e) { return e.id !== id && e.parentId !== id; });
    var idx = selectedIds.indexOf(id);
    if (idx !== -1) {
        selectedIds.splice(idx, 1);
    }
    if (selectedId === id) {
        selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
        renderProps();
    }
    updateAlignToolbar();
    render();
}

// Order helpers
function moveElement(id, dir) {
    var idx = elements.findIndex(function(e) { return e.id === id; });
    if (idx < 0) return;
    var swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= elements.length) return;
    var tmp = elements[idx];
    elements[idx] = elements[swap];
    elements[swap] = tmp;
    render();
}

// ============================================================
// RENDER CANVAS
function render() {
    var paper = document.getElementById('paper');
    paper.innerHTML = '';
    
    // Apply page configurations to paper background and font
    paper.style.background = pageConfig.bgColor || '#ffffff';
    var effectiveDefaultFont = getPageEffectiveFont();
    paper.style.fontFamily = effectiveDefaultFont === 'Times New Roman' ? "'Times New Roman', serif" : (effectiveDefaultFont === 'Roboto' ? "'Roboto', sans-serif" : "'" + effectiveDefaultFont + "', sans-serif");

    var sizes = { LETTER:[612,792], A4:[595,842], A5:[420,595], LEGAL:[612,1008] };
    var s = sizes[pageConfig.paperSize || 'LETTER'] || sizes.LETTER;
    var orient = pageConfig.paperOrient || 'portrait';
    var w = (orient==='landscape'?s[1]:s[0]);
    var h = (orient==='landscape'?s[0]:s[1]);

    function renderElementDOM(el) {
        var div = document.createElement('div');
        var isVisible = isElementVisible(el, variables);
        var isSelected = selectedIds.indexOf(el.id) !== -1;
        div.className = 'el el-' + el.type + (isSelected ? ' selected' : '') + (isVisible ? '' : ' hidden-preview');
        div.style.left = el.x + 'px';
        div.style.top = el.y + 'px';
        div.setAttribute('data-id', el.id);
        div.onmousedown = function(e) { e.stopPropagation(); startDrag(e, el.id); };
        div.onclick = function(e) { e.stopPropagation(); selectElement(el.id, e); };

        switch(el.type) {
            case 'text':
                div.style.fontSize = el.fontSize + 'px';
                div.style.fontWeight = el.bold ? 'bold' : 'normal';
                div.style.fontStyle = el.italic ? 'italic' : 'normal';
                div.style.textAlign = el.align;
                var effectiveFont = getElementEffectiveFont(el.font);
                div.style.fontFamily = effectiveFont ? "'" + effectiveFont + "', sans-serif" : "inherit";
                var textColor = el.color;
                if (el.isColorFx && el.colorFx) {
                    var evaluatedColor = evaluateFx(el.colorFx, variables);
                    if (evaluatedColor && !evaluatedColor.startsWith('Fx Error:')) {
                        textColor = evaluatedColor;
                    }
                }
                div.style.color = textColor || '#000000';
                var wVal = (el.width !== undefined && el.width !== null) ? el.width.toString() : '100';
                div.style.width = getParsedWidth(wVal) + 'px';
                div.style.whiteSpace = el.wrap === false ? 'nowrap' : 'pre-wrap';
                var displayVal = '';
                if (el.isFx) {
                    displayVal = el.fxExpr ? evaluateFx(el.fxExpr, variables) : '(Biểu thức Fx)';
                } else {
                    displayVal = el.text;
                }
                div.textContent = displayVal;
                break;
            case 'var':
                div.style.fontSize = el.fontSize + 'px';
                div.style.fontWeight = el.bold ? 'bold' : 'normal';
                div.style.fontStyle = el.italic ? 'italic' : 'normal';
                div.style.textAlign = el.align;
                var effectiveFont = getElementEffectiveFont(el.font);
                div.style.fontFamily = effectiveFont ? "'" + effectiveFont + "', sans-serif" : "inherit";
                var textColor = el.color;
                if (el.isColorFx && el.colorFx) {
                    var evaluatedColor = evaluateFx(el.colorFx, variables);
                    if (evaluatedColor && !evaluatedColor.startsWith('Fx Error:')) {
                        textColor = evaluatedColor;
                    }
                }
                div.style.color = textColor || '#000000';
                var wVal = (el.width !== undefined && el.width !== null) ? el.width.toString() : '100';
                div.style.width = getParsedWidth(wVal) + 'px';
                div.style.background = '#e8f4fd';
                div.style.borderRadius = '3px';
                div.style.whiteSpace = el.wrap === false ? 'nowrap' : 'pre-wrap';
                var displayVal = '';
                if (el.isFx) {
                    displayVal = el.fxExpr ? evaluateFx(el.fxExpr, variables) : '(Biểu thức Fx)';
                } else {
                    displayVal = variables[el.varName] !== undefined ? variables[el.varName] : '{' + el.varName + '}';
                }
                div.textContent = (el.prefix || '') + displayVal;
                break;
            case 'line':
                div.style.width = el.lineWidth + 'px';
                div.style.height = '0';
                div.style.borderBottom = el.lineWeight + 'px solid ' + el.color;
                break;
            case 'rect':
                div.style.width = el.rectW + 'px';
                div.style.height = el.rectH + 'px';
                div.style.border = el.lineWeight + 'px solid ' + el.color;
                div.style.borderRadius = el.radius + 'px';
                if (el.fillColor) div.style.background = el.fillColor;
                break;
            case 'shape':
                var angle = el.rotate || 0;
                var sw = el.lineWidth || 1;
                var sc = el.color || '#000000';
                var fc = el.fillColor || 'none';
                var swW = getParsedWidth(el.width || 100);
                var swH = el.height || 50;
                
                var rSize = getRotatedSize(swW, swH, angle);
                var svg = '<svg width="'+rSize.w+'" height="'+rSize.h+'" style="position:absolute; left:-'+rSize.dx+'px; top:-'+rSize.dy+'px; overflow:visible; display:block;">';
                svg += '<g transform="translate('+(rSize.w/2)+' '+(rSize.h/2)+') rotate('+angle+') translate('+(-swW/2)+' '+(-swH/2)+')">';
                
                if (el.shapeType === 'rect') {
                    var r = el.radius || 0;
                    svg += '<rect x="'+(sw/2)+'" y="'+(sw/2)+'" width="'+(swW-sw)+'" height="'+(swH-sw)+'" rx="'+r+'" ry="'+r+'" stroke="'+sc+'" stroke-width="'+sw+'" fill="'+fc+'" />';
                } else if (el.shapeType === 'line') {
                    svg += '<line x1="0" y1="'+(swH/2)+'" x2="'+swW+'" y2="'+(swH/2)+'" stroke="'+sc+'" stroke-width="'+sw+'" />';
                } else if (el.shapeType === 'ellipse') {
                    svg += '<ellipse cx="'+(swW/2)+'" cy="'+(swH/2)+'" rx="'+((swW-sw)/2)+'" ry="'+((swH-sw)/2)+'" stroke="'+sc+'" stroke-width="'+sw+'" fill="'+fc+'" />';
                } else if (el.shapeType === 'polygon') {
                    var pts = el.points || '0,0 50,50 100,0';
                    if (el.close) {
                        svg += '<polygon points="'+pts+'" stroke="'+sc+'" stroke-width="'+sw+'" fill="'+fc+'" />';
                    } else {
                        svg += '<polyline points="'+pts+'" stroke="'+sc+'" stroke-width="'+sw+'" fill="none" />';
                    }
                }
                svg += '</g></svg>';
                
                div.style.width = swW + 'px';
                div.style.height = swH + 'px';
                div.innerHTML = svg;
                break;
            case 'image':
                var src = el.imageSrc || '';
                if (el.dataVar && variables[el.dataVar]) {
                    src = variables[el.dataVar];
                }
                
                var wVal = (el.width !== undefined && el.width !== null) ? el.width.toString() : '100';
                var imgW = getParsedWidth(wVal);
                var imgH = el.height || 100;
                var angle = el.rotate || 0;
                
                if (angle !== 0) {
                    var rSize = getRotatedSize(imgW, imgH, angle);
                    var svg = '<svg width="'+rSize.w+'" height="'+rSize.h+'" style="position:absolute; left:-'+rSize.dx+'px; top:-'+rSize.dy+'px; overflow:visible; display:block;">';
                    svg += '<g transform="translate('+(rSize.w/2)+' '+(rSize.h/2)+') rotate('+angle+') translate('+(-imgW/2)+' '+(-imgH/2)+')">';
                    svg += '<image href="'+src+'" xlink:href="'+src+'" width="'+imgW+'" height="'+imgH+'" />';
                    svg += '</g></svg>';
                    
                    div.style.width = imgW + 'px';
                    div.style.height = imgH + 'px';
                    div.innerHTML = svg;
                } else {
                    var img = document.createElement('img');
                    img.src = src;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.display = 'block';
                    
                    div.style.width = imgW + 'px';
                    div.style.height = imgH + 'px';
                    div.innerHTML = '';
                    div.appendChild(img);
                }
                break;
            case 'table':
                var bdrW = (el.borderWidth||1) + 'px';
                var bdrC = el.borderColor||'#000';
                var bdrS = el.borderStyle||'solid';
                var bdrStyle = '';
                if (el.showBorder) {
                    var bL = el.borderLeft !== false ? bdrW+' '+bdrS+' '+bdrC : 'none';
                    var bT = el.borderTop !== false ? bdrW+' '+bdrS+' '+bdrC : 'none';
                    var bR = el.borderRight !== false ? bdrW+' '+bdrS+' '+bdrC : 'none';
                    var bB = el.borderBottom !== false ? bdrW+' '+bdrS+' '+bdrC : 'none';
                    bdrStyle = 'border-left:'+bL+';border-top:'+bT+';border-right:'+bR+';border-bottom:'+bB;
                } else {
                    bdrStyle = 'border:none';
                }
                var hAligns = (el.headerAligns||'center').split(',').map(function(a){return a.trim();});
                var bAligns = (el.bodyAligns||'left').split(',').map(function(a){return a.trim();});
                var bBold = el.bold ? 'font-weight:bold;' : '';
                var bItalic = el.italic ? 'font-style:italic;' : '';
                var tColor = 'color:'+(el.color||'#000')+';';
                
                var displayData = el.data || [];
                if (el.dataVar && Array.isArray(variables[el.dataVar])) {
                    var varData = variables[el.dataVar];
                    var fields = parseFieldMappings(el);
                    displayData = varData.map(function(item, rIdx) {
                        var row = [];
                        var keys = Object.keys(item);
                        for (var i = 0; i < el.headers.length; i++) {
                            var resolved = resolveFieldValue(fields[i], item, rIdx);
                            if (resolved !== undefined) {
                                row.push(resolved);
                            } else {
                                row.push((keys[i] !== undefined && item[keys[i]] !== undefined) ? item[keys[i]] : '');
                            }
                        }
                        return row;
                    });
                }
                
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

                var pTop = (el.paddingTop !== undefined && el.paddingTop !== '') ? el.paddingTop : 4;
                var pBottom = (el.paddingBottom !== undefined && el.paddingBottom !== '') ? el.paddingBottom : 4;
                var pLeft = (el.paddingLeft !== undefined && el.paddingLeft !== '') ? el.paddingLeft : 6;
                var pRight = (el.paddingRight !== undefined && el.paddingRight !== '') ? el.paddingRight : 6;
                var paddingStyle = 'padding:' + pTop + 'px ' + pRight + 'px ' + pBottom + 'px ' + pLeft + 'px;';

                var effectiveFont = getElementEffectiveFont(el.font);
                var tblFont = effectiveFont ? 'font-family:\'' + effectiveFont + '\', sans-serif;' : '';
                var tbl = '<table style="table-layout:fixed;border-collapse:collapse;width:100%;font-size:'+el.fontSize+'px;'+tblFont+tColor+'">';
                var parsedWidths = (el.widths || '').split(',').map(function(w){return w.trim();});
                tbl += '<colgroup>';
                el.headers.forEach(function(h, i) {
                    var w = parsedWidths[i] || '*';
                    if (!isNaN(w) && w !== '') {
                        tbl += '<col style="width:' + w + 'px;">';
                    } else if (w.indexOf('%') !== -1) {
                        tbl += '<col style="width:' + w + ';">';
                    } else {
                        tbl += '<col>';
                    }
                });
                tbl += '</colgroup>';
                
                if (el.showHeader !== false) {
                    tbl += '<tr>';
                    el.headers.forEach(function(h,i) {
                        var cellBg = colFills[i] || '';
                        var bgStyle = cellBg ? 'background-color:' + cellBg + ';' : '';
                        var hBoldVal = headerBolds[i] !== undefined ? headerBolds[i] : (el.headerBold !== false);
                        var hBoldStyle = hBoldVal ? 'font-weight:bold;' : 'font-weight:normal;';
                        var cellColor = colColors[i] || el.color || '#000000';
                        var colorStyle = 'color:' + cellColor + ';';
                        tbl += '<th style="'+bdrStyle+';'+paddingStyle+hBoldStyle+'text-align:'+(hAligns[i]||hAligns[0]||'center')+';'+bgStyle+colorStyle+'">' +h+'</th>';
                    });
                    tbl += '</tr>';
                }
                displayData.forEach(function(row, rIdx) {
                    tbl += '<tr>';
                    row.forEach(function(c,i) {
                        var isEvenRow = (rIdx % 2 === 1);
                        var rowBg = isEvenRow ? evenFill : oddFill;
                        var cellBg = colFills[i] || rowBg || '';
                        var bgStyle = cellBg ? 'background-color:' + cellBg + ';' : '';
                        var cellColor = colColors[i] || el.color || '#000000';
                        var colorStyle = 'color:' + cellColor + ';';
                        var cellVal = (c === undefined || c === null) ? '' : String(c).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
                        tbl += '<td style="'+bdrStyle+';'+paddingStyle+'text-align:'+(bAligns[i]||bAligns[0]||'left')+';'+bBold+bItalic+bgStyle+colorStyle+'">'+cellVal+'</td>';
                    });
                    tbl += '</tr>';
                });
                tbl += '</table>';
                div.style.width = getElementWidth(el) + 'px';
                div.innerHTML = tbl;
                break;
            case 'panel':
                var panelW = (el.width !== undefined && el.width !== null) ? el.width.toString() : '200';
                div.style.width = getParsedWidth(panelW) + 'px';
                div.style.height = el.height + 'px';
                div.style.background = (el.bgColor && el.bgColor !== 'transparent') ? el.bgColor : 'rgba(0,0,0,0)';
                div.style.border = (el.showBorder !== false) ? ((el.borderWidth || 1) + 'px solid ' + (el.borderColor || '#cbd5e1')) : 'none';
                div.style.boxSizing = 'border-box';
                div.style.outline = '1px dashed rgba(137, 180, 250, 0.45)';
                div.style.outlineOffset = '-1px';
                div.innerHTML = '<span style="position:absolute;top:2px;left:4px;font-size:8px;color:rgba(137,180,250,0.6);pointer-events:none;user-select:none;letter-spacing:0.5px;">PANEL</span>';
                break;
            case 'pagebreak':
                div.style.width = '100%';
                div.style.height = '20px';
                div.style.borderTop = '2px dashed #f38ba8';
                div.style.borderBottom = '2px dashed #f38ba8';
                div.style.background = 'rgba(243, 139, 168, 0.15)';
                div.style.color = '#f38ba8';
                div.style.fontSize = '10px';
                div.style.fontWeight = 'bold';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.justifyContent = 'center';
                div.style.pointerEvents = 'auto';
                div.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px; vertical-align:middle;"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="9.8" y1="8.2" x2="22" y2="20"></line><line x1="9.8" y1="15.8" x2="22" y2="4"></line></svg> NGẮT TRANG (PAGE BREAK)';
                break;
            case 'emptyline':
                div.style.width = '100%';
                div.style.height = (el.height || 20) + 'px';
                div.style.borderTop = '1px dashed #a6adc888';
                div.style.borderBottom = '1px dashed #a6adc888';
                div.style.background = 'rgba(166, 173, 200, 0.08)';
                div.style.color = '#a6adc8';
                div.style.fontSize = '9px';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.justifyContent = 'center';
                div.style.pointerEvents = 'auto';
                div.textContent = 'EMPTY LINE (' + (el.height || 20) + 'px)';
                break;
        }

        if (el.parentId) {
            var parentDiv = paper.querySelector('.el[data-id="' + el.parentId + '"]');
            if (parentDiv) {
                parentDiv.appendChild(div);
                return;
            }
        }
        paper.appendChild(div);
    }

    // 1. Render all elements to DOM first (so that their actual heights can be computed by the browser)
    elements.forEach(function(el) {
        if (el.type === 'panel') {
            renderElementDOM(el);
        }
    });

    elements.forEach(function(el) {
        if (el.type !== 'panel') {
            renderElementDOM(el);
        }
    });

    // 1.5 Auto-push: shift elements below tables/texts/vars that overlap with actual rendered height
    var pushSources = elements.filter(function(e) {
        return (e.type === 'table' || e.type === 'text' || e.type === 'var') && !e.parentId && !isOverlayingShape(e);
    });
    pushSources.sort(function(a, b) { return a.y - b.y; });
    var yOffsets = {}; // el.id -> cumulative offset
    pushSources.forEach(function(srcEl) {
        var dom = document.querySelector('.el[data-id="' + srcEl.id + '"]');
        if (!dom) return;
        
        var designHeight = getElementHeight(srcEl, variables);
        var actualHeight = dom.offsetHeight;
        if (srcEl.type === 'text' || srcEl.type === 'var') {
            var fs = srcEl.fontSize || 13;
            var browserLineHeight = fs * 1.4;
            var lines = Math.max(1, Math.round(actualHeight / browserLineHeight));
            actualHeight = lines * designHeight;
        }
        
        var currentSrcY = srcEl.y + (yOffsets[srcEl.id] || 0);
        var actualBottom = currentSrcY + actualHeight;

        // Collect elements below the source's Y
        var belowEls = [];
        elements.forEach(function(otherEl) {
            if (otherEl.id === srcEl.id || otherEl.parentId) return;
            var currentY = otherEl.y + (yOffsets[otherEl.id] || 0);
            if (currentY > currentSrcY + 5) {
                belowEls.push({ el: otherEl, currentY: currentY });
            }
        });
        if (belowEls.length === 0) return;
        belowEls.sort(function(a, b) { return a.currentY - b.currentY; });

        // Check if the first element overlaps with source
        if (belowEls[0].currentY >= actualBottom) return;

        // Push all elements below source by the same amount to preserve relative spacing
        var push = actualBottom - belowEls[0].currentY;
        belowEls.forEach(function(item) {
            yOffsets[item.el.id] = (yOffsets[item.el.id] || 0) + push;
        });
    });
    // Apply offsets to DOM
    console.log("yOffsets before apply:", JSON.stringify(yOffsets));
    Object.keys(yOffsets).forEach(function(id) {
        var dom = document.querySelector('.el[data-id="' + id + '"]');
        if (dom) {
            var el = elements.find(function(e) { return e.id === +id || e.id === id; });
            if (el) {
                dom.style.top = (el.y + yOffsets[id]) + 'px';
            }
        }
    });

    // 2. Now calculate total pages dynamically using the actual DOM heights
    var maxY = h; // At least one page height
    elements.forEach(function(el) {
        var elH = getElementHeight(el);
        var offset = yOffsets[el.id] || 0;
        var bottom = el.y + offset + elH;
        if (bottom > maxY) {
            maxY = bottom;
        }
    });

    var pageBreaks = elements.filter(function(e) { return e.type === 'pagebreak'; }).sort(function(a,b) { return a.y - b.y; });
    if (pageBreaks.length > 0) {
        var lastPB = pageBreaks[pageBreaks.length - 1];
        if (lastPB.y + 100 > maxY) {
            maxY = lastPB.y + 100;
        }
    }

    var totalPages = Math.ceil(maxY / h);
    if (totalPages < 1) totalPages = 1;

    paper.style.width = w + 'px';
    paper.style.height = (totalPages * h) + 'px';

    // 3. Prepend margin guides and dividers at the top of the DOM flow (so they draw behind active elements)
    // Add page dividers
    for (var p = 1; p < totalPages; p++) {
        var divider = document.createElement('div');
        divider.className = 'page-divider';
        divider.style.position = 'absolute';
        divider.style.left = '0';
        divider.style.width = '100%';
        divider.style.top = (p * h) + 'px';
        divider.style.borderTop = '2px dashed #89b4fa';
        divider.style.zIndex = '5';
        divider.style.pointerEvents = 'none';
        
        var label = document.createElement('div');
        label.style.position = 'absolute';
        label.style.right = '10px';
        label.style.top = '-18px';
        label.style.background = '#89b4fa';
        label.style.color = '#1e1e2e';
        label.style.fontWeight = 'bold';
        label.style.fontSize = '10px';
        label.style.padding = '2px 6px';
        label.style.borderRadius = '4px';
        label.style.fontFamily = 'sans-serif';
        label.textContent = 'Page ' + (p + 1);
        
        divider.appendChild(label);
        paper.insertBefore(divider, paper.firstChild);
    }

    // Add margin guides
    for (var p = 0; p < totalPages; p++) {
        var marginGuide = document.createElement('div');
        marginGuide.className = 'margin-guide';
        marginGuide.style.left = pageConfig.marginLeft + 'px';
        marginGuide.style.top = (p * h + pageConfig.marginTop) + 'px';
        var guideW = w - pageConfig.marginLeft - pageConfig.marginRight;
        var guideH = h - pageConfig.marginTop - pageConfig.marginBottom;
        if (guideW > 0 && guideH > 0) {
            marginGuide.style.width = guideW + 'px';
            marginGuide.style.height = guideH + 'px';
            paper.insertBefore(marginGuide, paper.firstChild);
        }
    }

    // Render Drag Guides & Tooltip if dragging
    if (dragState && dragState.guides) {
        var paper = document.getElementById('paper');
        // Draw vertical guides
        dragState.guides.v.forEach(function(x) {
            var g = document.createElement('div');
            g.className = 'guide-line guide-v';
            g.style.left = x + 'px';
            g.style.display = 'block';
            paper.appendChild(g);
        });
        // Draw horizontal guides
        dragState.guides.h.forEach(function(y) {
            var g = document.createElement('div');
            g.className = 'guide-line guide-h';
            g.style.top = y + 'px';
            g.style.display = 'block';
            paper.appendChild(g);
        });
        // Draw Coordinates Tooltip
        var tooltip = document.createElement('div');
        tooltip.className = 'coord-tooltip';
        tooltip.style.left = (dragState.currentX) + 'px';
        tooltip.style.top = (dragState.currentY - 22) + 'px';
        tooltip.style.display = 'block';
        tooltip.textContent = 'X: ' + dragState.currentX + ', Y: ' + dragState.currentY;
        paper.appendChild(tooltip);
    }

    renderVarList();
    renderOutline();
    triggerLivePreviewUpdate();
}

// ============================================================
// DRAG
// ============================================================
function startDrag(e, id) {
    saveUndo();
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    var el = elements.find(function(item) { return item.id === id; });
    if (!el) return;
    
    var isCtrl = e && (e.ctrlKey || e.metaKey);
    var shouldDeselectOnMouseUp = false;
    
    // If the clicked element is not part of the current selection, update selection
    if (selectedIds.indexOf(id) === -1) {
        if (isCtrl) {
            selectedIds.push(id);
            selectedId = id;
        } else {
            selectedIds = [id];
            selectedId = id;
        }
        updateAlignToolbar();
        render();
    } else {
        if (isCtrl) {
            shouldDeselectOnMouseUp = true;
        }
    }
    
    // Store original coordinates of all selected elements
    var dragElements = elements.filter(function(item) {
        return selectedIds.indexOf(item.id) !== -1;
    }).map(function(item) {
        var absPos = getElementAbsPos(item);
        return {
            id: item.id,
            origX: item.x,
            origY: item.y,
            origAbsX: absPos.x,
            origAbsY: absPos.y,
            parentId: item.parentId,
            width: getElementWidth(item),
            height: getElementHeight(item)
        };
    });
    
    dragState = { 
        id: id, 
        startX: e.clientX, 
        startY: e.clientY, 
        dragElements: dragElements,
        hasMoved: false,
        shouldDeselectOnMouseUp: shouldDeselectOnMouseUp
    };
    document.onmousemove = onDrag;
    document.onmouseup = endDrag;
}
function getElementHeight(el, vars) {
    if (el.type === 'shape') {
        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
        return rSize.h;
    }
    if (el.type === 'image' && el.rotate) {
        var rSize = getRotatedSize(getParsedWidth(el.width) || 100, el.height || 100, el.rotate || 0);
        return rSize.h;
    }
    if (vars === undefined) {
        var dom = document.querySelector('.el[data-id="' + el.id + '"]');
        if (dom) return dom.offsetHeight;
    }
    if (el.type === 'rect') return el.rectH || 20;
    if (el.type === 'line') return el.lineWeight || 1;
    if (el.type === 'text' || el.type === 'var') return Math.ceil((el.fontSize || 13) * 1.15);
    if (el.type === 'table') {
        var displayData = el.data || [];
        var activeVars = vars || variables;
        if (el.dataVar && activeVars && Array.isArray(activeVars[el.dataVar])) {
            displayData = activeVars[el.dataVar];
        }
        var rowsCount = displayData.length + (el.showHeader !== false ? 1 : 0);
        return rowsCount * (el.fontSize + 8) + 10;
    }
    if (el.type === 'image') return el.height || 100;
    if (el.type === 'panel') return el.height || 150;
    if (el.type === 'emptyline') return el.height || 20;
    return 20;
}

function onDrag(e) {
    if (!dragState) return;
    var el = elements.find(function(e) { return e.id === dragState.id; });
    if (!el) return;
    
    if (Math.abs(e.clientX - dragState.startX) > 3 || Math.abs(e.clientY - dragState.startY) > 3) {
        dragState.hasMoved = true;
    }
    
    // Get paper size for bounding
    var paperSize = pageConfig.paperSize || 'LETTER';
    var paperOrient = pageConfig.paperOrient || 'portrait';
    var sizes = { LETTER:[612,792], A4:[595,842], A5:[420,595], LEGAL:[612,1008] };
    var s = sizes[paperSize] || sizes.LETTER;
    var w = (paperOrient==='landscape'?s[1]:s[0]);
    var h = (paperOrient==='landscape'?s[0]:s[1]);

    // Calculate the dragged element's raw relative coordinates
    var primaryDragInfo = dragState.dragElements.find(function(info) { return info.id === el.id; });
    var rawRelX = Math.max(0, primaryDragInfo.origX + (e.clientX - dragState.startX));
    var rawRelY = Math.max(0, primaryDragInfo.origY + (e.clientY - dragState.startY));
    
    // Convert to raw absolute coordinates (relative to paper) for snapping
    var parentAbsX = 0;
    var parentAbsY = 0;
    if (el.parentId) {
        var parent = elements.find(function(e) { return e.id === el.parentId; });
        if (parent) {
            var pPos = getElementAbsPos(parent);
            parentAbsX = pPos.x;
            parentAbsY = pPos.y;
        }
    }
    
    var rawAbsX = parentAbsX + rawRelX;
    var rawAbsY = parentAbsY + rawRelY;
    
    var snapThresh = 5;
    var elW = getElementWidth(el);
    var elH = getElementHeight(el);
    
    var snapAbsX = null;
    var snapAbsY = null;
    var guideLines = { v: [], h: [] };
    
    // Determine if element is inside a panel and still within bounds
    var insidePanel = false;
    var panelParent = null;
    if (el.parentId) {
        panelParent = elements.find(function(p) { return p.id === el.parentId; });
        if (panelParent) {
            var ppAbs = getElementAbsPos(panelParent);
            var ppW = getParsedWidth(panelParent.width) || 200;
            var ppH = panelParent.height || 150;
            // Check if element center is still inside panel
            var cX = rawAbsX + elW / 2;
            var cY = rawAbsY + elH / 2;
            insidePanel = (cX >= ppAbs.x && cX <= ppAbs.x + ppW && cY >= ppAbs.y && cY <= ppAbs.y + ppH);
        }
    }
    
    // If inside panel: snap to panel edges
    if (insidePanel && panelParent) {
        var ppAbs2 = getElementAbsPos(panelParent);
        var ppW2 = getParsedWidth(panelParent.width) || 200;
        var ppH2 = panelParent.height || 150;
        // Snap to panel left/right edges
        if (Math.abs(rawAbsX - ppAbs2.x) < snapThresh) { snapAbsX = ppAbs2.x; guideLines.v.push(ppAbs2.x); }
        if (Math.abs((rawAbsX + elW) - (ppAbs2.x + ppW2)) < snapThresh) { snapAbsX = ppAbs2.x + ppW2 - elW; guideLines.v.push(ppAbs2.x + ppW2); }
        if (Math.abs((rawAbsX + elW/2) - (ppAbs2.x + ppW2/2)) < snapThresh) { snapAbsX = ppAbs2.x + ppW2/2 - elW/2; guideLines.v.push(ppAbs2.x + ppW2/2); }
        // Snap to panel top/bottom edges
        if (Math.abs(rawAbsY - ppAbs2.y) < snapThresh) { snapAbsY = ppAbs2.y; guideLines.h.push(ppAbs2.y); }
        if (Math.abs((rawAbsY + elH) - (ppAbs2.y + ppH2)) < snapThresh) { snapAbsY = ppAbs2.y + ppH2 - elH; guideLines.h.push(ppAbs2.y + ppH2); }
        if (Math.abs((rawAbsY + elH/2) - (ppAbs2.y + ppH2/2)) < snapThresh) { snapAbsY = ppAbs2.y + ppH2/2 - elH/2; guideLines.h.push(ppAbs2.y + ppH2/2); }
    }
    
    elements.forEach(function(other) {
        if (other.id === el.id) return;
        
        // Skip elements nested inside the dragged element
        var isChildOfDragged = false;
        var curr = other;
        while (curr && curr.parentId) {
            if (curr.parentId === el.id) {
                isChildOfDragged = true;
                break;
            }
            curr = elements.find(function(e) { return e.id === curr.parentId; });
        }
        if (isChildOfDragged) return;
        
        // If inside panel: only snap to siblings (same parentId), skip everything else
        if (insidePanel) {
            if (other.parentId !== el.parentId) return;
        } else if (el.parentId) {
            // Dragged outside panel: skip siblings, snap to outside elements only
            if (other.parentId === el.parentId) return;
        }

        var othPos = getElementAbsPos(other);
        var othW = getElementWidth(other);
        var othH = getElementHeight(other);
        
        // Vertical snapping & guidelines (Left, Right, Center, and Adjacent)
        if (Math.abs(rawAbsX - othPos.x) < snapThresh) {
            snapAbsX = othPos.x;
            guideLines.v.push(othPos.x);
        }
        if (Math.abs((rawAbsX + elW) - (othPos.x + othW)) < snapThresh) {
            snapAbsX = othPos.x + othW - elW;
            guideLines.v.push(othPos.x + othW);
        }
        if (Math.abs((rawAbsX + elW/2) - (othPos.x + othW/2)) < snapThresh) {
            snapAbsX = othPos.x + othW/2 - elW/2;
            guideLines.v.push(othPos.x + othW/2);
        }
        // Adjacent snapping (right edge to left edge, left edge to right edge)
        if (Math.abs((rawAbsX + elW) - othPos.x) < snapThresh) {
            snapAbsX = othPos.x - elW;
            guideLines.v.push(othPos.x);
        }
        if (Math.abs(rawAbsX - (othPos.x + othW)) < snapThresh) {
            snapAbsX = othPos.x + othW;
            guideLines.v.push(othPos.x + othW);
        }
        
        // Horizontal snapping & guidelines (Top, Bottom, Center, and Adjacent)
        if (Math.abs(rawAbsY - othPos.y) < snapThresh) {
            snapAbsY = othPos.y;
            guideLines.h.push(othPos.y);
        }
        if (Math.abs((rawAbsY + elH) - (othPos.y + othH)) < snapThresh) {
            snapAbsY = othPos.y + othH - elH;
            guideLines.h.push(othPos.y + othH);
        }
        if (Math.abs((rawAbsY + elH/2) - (othPos.y + othH/2)) < snapThresh) {
            snapAbsY = othPos.y + othH/2 - elH/2;
            guideLines.h.push(othPos.y + othH/2);
        }
        // Adjacent snapping (bottom edge to top edge, top edge to bottom edge)
        if (Math.abs((rawAbsY + elH) - othPos.y) < snapThresh) {
            snapAbsY = othPos.y - elH;
            guideLines.h.push(othPos.y);
        }
        if (Math.abs(rawAbsY - (othPos.y + othH)) < snapThresh) {
            snapAbsY = othPos.y + othH;
            guideLines.h.push(othPos.y + othH);
        }
    });
    
    // Snap to page margins (padding edges)
    var mL = pageConfig.marginLeft || 0;
    var mR = w - (pageConfig.marginRight || 0);
    var mT = pageConfig.marginTop || 0;
    var mB = pageConfig.marginBottom || 0;
    
    // Snapping to left/right margins
    if (Math.abs(rawAbsX - mL) < snapThresh) {
        snapAbsX = mL;
        if (guideLines.v.indexOf(mL) === -1) guideLines.v.push(mL);
    }
    if (Math.abs((rawAbsX + elW) - mR) < snapThresh) {
        snapAbsX = mR - elW;
        if (guideLines.v.indexOf(mR) === -1) guideLines.v.push(mR);
    }
    
    // Snapping to top/bottom margins of each page
    var maxYForPages = h;
    elements.forEach(function(item) {
        if (item.id === el.id) return;
        var bottom = item.y + getElementHeight(item);
        if (bottom > maxYForPages) maxYForPages = bottom;
    });
    var pBreaks = elements.filter(function(e) { return e.type === 'pagebreak'; }).sort(function(a,b) { return a.y - b.y; });
    if (pBreaks.length > 0) {
        var lastPB = pBreaks[pBreaks.length - 1];
        if (lastPB.y + 100 > maxYForPages) maxYForPages = lastPB.y + 100;
    }
    var currentPages = Math.ceil(maxYForPages / h);
    var dragBottom = rawAbsY + elH;
    var maxPossiblePages = currentPages;
    if (dragBottom > (currentPages * h) - 50) {
        maxPossiblePages = currentPages + 1;
    }
    
    for (var p = 0; p < maxPossiblePages; p++) {
        var pageTopMargin = p * h + mT;
        var pageBottomMargin = (p + 1) * h - mB;
        
        if (Math.abs(rawAbsY - pageTopMargin) < snapThresh) {
            snapAbsY = pageTopMargin;
            if (guideLines.h.indexOf(pageTopMargin) === -1) guideLines.h.push(pageTopMargin);
        }
        if (Math.abs((rawAbsY + elH) - pageBottomMargin) < snapThresh) {
            snapAbsY = pageBottomMargin - elH;
            if (guideLines.h.indexOf(pageBottomMargin) === -1) guideLines.h.push(pageBottomMargin);
        }
    }
    
    var finalAbsX = (snapAbsX !== null) ? snapAbsX : rawAbsX;
    var finalAbsY = (snapAbsY !== null) ? snapAbsY : rawAbsY;
    
    var deltaAbsX = finalAbsX - primaryDragInfo.origAbsX;
    var deltaAbsY = finalAbsY - primaryDragInfo.origAbsY;
    
    dragState.dragElements.forEach(function(itemInfo) {
        var item = elements.find(function(x) { return x.id === itemInfo.id; });
        if (!item) return;
        
        var targetAbsX = itemInfo.origAbsX + deltaAbsX;
        var targetAbsY = itemInfo.origAbsY + deltaAbsY;
        
        if (item.parentId) {
            var parent = elements.find(function(e) { return e.id === item.parentId; });
            if (parent) {
                var pPos = getElementAbsPos(parent);
                var relX = targetAbsX - pPos.x;
                var relY = targetAbsY - pPos.y;
                var pW = getParsedWidth(parent.width) || 200;
                var pH = parent.height || 150;
                relX = Math.max(0, Math.min(pW - itemInfo.width, relX));
                relY = Math.max(0, Math.min(pH - itemInfo.height, relY));
                item.x = relX;
                item.y = relY;
            }
        } else {
            item.x = Math.max(0, Math.min(w - itemInfo.width, targetAbsX));
            
            // Calculate max Y among all other non-dragged elements to know the current canvas height
            var maxY = h;
            elements.forEach(function(other) {
                if (selectedIds.indexOf(other.id) !== -1) return;
                var bottom = other.y + getElementHeight(other);
                if (bottom > maxY) maxY = bottom;
            });
            
            var pageBreaks = elements.filter(function(e) { return e.type === 'pagebreak'; }).sort(function(a,b) { return a.y - b.y; });
            if (pageBreaks.length > 0) {
                var lastPB = pageBreaks[pageBreaks.length - 1];
                if (lastPB.y + 100 > maxY) {
                    maxY = lastPB.y + 100;
                }
            }
            
            var currentPages = Math.ceil(maxY / h);
            var dragBottom = targetAbsY + itemInfo.height;
            var maxPossiblePages = currentPages;
            if (dragBottom > (currentPages * h) - 50) {
                maxPossiblePages = currentPages + 1;
            }
            
            var maxCanvasHeight = maxPossiblePages * h;
            item.y = Math.max(0, Math.min(maxCanvasHeight - itemInfo.height, targetAbsY));
        }
        
        if (item.type === 'pagebreak') {
            item.x = 0;
        }
    });
    
    dragState.guides = guideLines;
    dragState.currentX = el.parentId ? (parentAbsX + el.x) : el.x;
    dragState.currentY = el.parentId ? (parentAbsY + el.y) : el.y;
    
    render();
}
function endDrag(e) {
    if (dragState) {
        var el = elements.find(function(item) { return item.id === dragState.id; });
        if (el) {
            var isDrag = dragState.hasMoved;
            
            if (!isDrag) {
                var now = Date.now();
                if (lastClickedId === el.id && (now - lastClickTime) < 300) {
                    if (el.type === 'var') {
                        if (el.isFx) {
                            openFxEditor(el.id, 'fxExpr');
                        } else {
                            editVar(el.varName, e);
                        }
                    } else if (el.type === 'text') {
                        if (el.isFx) {
                            openFxEditor(el.id, 'fxExpr');
                        }
                    }
                    lastClickTime = 0;
                    lastClickedId = null;
                } else {
                    lastClickTime = now;
                    lastClickedId = el.id;
                    // If it wasn't dragged, toggle or select
                    if (dragState.shouldDeselectOnMouseUp) {
                        selectElement(el.id, e);
                    } else if (!e.ctrlKey && !e.metaKey) {
                        // Normal click: select exclusively
                        selectElement(el.id, e);
                    }
                }
            } else {
                lastClickTime = 0;
                lastClickedId = null;
                // Keep the multi-selection as is and just refresh the toolbar
                updateAlignToolbar();
                
                // Update parent container for all dragged elements
                dragState.dragElements.forEach(function(itemInfo) {
                    var item = elements.find(function(x) { return x.id === itemInfo.id; });
                    if (!item) return;
                    if (item.type !== 'panel' && item.type !== 'pagebreak') {
                        var elAbsPos = getElementAbsPos(item);
                        var elW = getElementWidth(item);
                        var elH = getElementHeight(item);
                        var elCenterX = elAbsPos.x + elW / 2;
                        var elCenterY = elAbsPos.y + elH / 2;
                        
                        var containingPanels = elements.filter(function(p) {
                            if (p.type !== 'panel' || p.id === item.id) return false;
                            // Do not parent to a panel that is also part of the dragging group to avoid cycles
                            if (selectedIds.indexOf(p.id) !== -1) return false;
                            var pAbs = getElementAbsPos(p);
                            var pW = getParsedWidth(p.width) || 200;
                            var pH = p.height || 150;
                            return (elCenterX >= pAbs.x && elCenterX <= pAbs.x + pW &&
                                    elCenterY >= pAbs.y && elCenterY <= pAbs.y + pH);
                        });
                        
                        var targetParentId = null;
                        if (containingPanels.length > 0) {
                            containingPanels.sort(function(a, b) {
                                return ((getParsedWidth(a.width)||200) * (a.height||150)) - ((getParsedWidth(b.width)||200) * (b.height||150));
                            });
                            targetParentId = containingPanels[0].id;
                        }
                        
                        if (item.parentId !== targetParentId) {
                            changeElementParent(item.id, targetParentId ? targetParentId.toString() : null);
                        }
                    }
                });
            }
        }
    }
    
    dragState = null;
    document.onmousemove = null;
    document.onmouseup = null;
    render();
    renderProps();
}

// ============================================================
// SELECT / DESELECT
// ============================================================
function selectElement(id, event) {
    blurActivePropertyInput();
    var isCtrl = event && (event.ctrlKey || event.metaKey);
    if (isCtrl) {
        var idx = selectedIds.indexOf(id);
        if (idx !== -1) {
            selectedIds.splice(idx, 1);
        } else {
            selectedIds.push(id);
        }
        selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
    } else {
        selectedIds = [id];
        selectedId = id;
    }
    updateAlignToolbar();
    render();
    renderProps();
}
function deselect(e) {
    if (e.target.classList.contains('canvas-wrap') || e.target.id === 'paper') {
        blurActivePropertyInput();
        var isCtrl = e && (e.ctrlKey || e.metaKey);
        if (!isCtrl) {
            selectedId = null;
            selectedIds = [];
            updateAlignToolbar();
            render();
            renderProps();
        }
    }
}

function getElementAbsPos(el) {
    var x = el.x;
    var y = el.y;
    var curr = el;
    while (curr && curr.parentId) {
        var parent = elements.find(function(e) { return e.id === curr.parentId; });
        if (parent) {
            x += parent.x;
            y += parent.y;
            curr = parent;
        } else {
            break;
        }
    }
    return { x: x, y: y };
}

function changeElementParent(elementId, newParentIdStr) {
    var el = elements.find(function(e) { return e.id === elementId; });
    if (!el) return;
    
    var newParentId = newParentIdStr ? parseInt(newParentIdStr) : null;
    if (el.parentId === newParentId) return;
    
    var oldAbsPos = getElementAbsPos(el);
    el.parentId = newParentId;
    
    if (newParentId) {
        var newParent = elements.find(function(e) { return e.id === newParentId; });
        if (newParent) {
            var newParentAbsPos = getElementAbsPos(newParent);
            el.x = oldAbsPos.x - newParentAbsPos.x;
            el.y = oldAbsPos.y - newParentAbsPos.y;
        }
    } else {
        el.x = oldAbsPos.x;
        el.y = oldAbsPos.y;
    }
    
    render();
    renderProps();
}

// ============================================================
// PROPERTIES PANEL
// ============================================================
function renderProps() {
    var panel = document.getElementById('propsContent');
    if (!selectedId) {
        panel.removeAttribute('data-el-id');
        var pageHtml = '';
        pageHtml += '<h3>Page Settings</h3>';
        
        // Paper Size & Orientation
        pageHtml += '<div class="prop-row"><label>Paper size</label><select onchange="setPageConfig(\'paperSize\',this.value);changePaper();">';
        pageHtml += '<option '+(pageConfig.paperSize==='LETTER'?'selected':'')+' value="LETTER">Letter</option>';
        pageHtml += '<option '+(pageConfig.paperSize==='A4'?'selected':'')+' value="A4">A4</option>';
        pageHtml += '<option '+(pageConfig.paperSize==='A5'?'selected':'')+' value="A5">A5</option>';
        pageHtml += '<option '+(pageConfig.paperSize==='LEGAL'?'selected':'')+' value="LEGAL">Legal</option>';
        pageHtml += '</select></div>';

        pageHtml += '<div class="prop-row"><label>Orientation</label><select onchange="setPageConfig(\'paperOrient\',this.value);changePaper();">';
        pageHtml += '<option '+(pageConfig.paperOrient==='portrait'?'selected':'')+' value="portrait">Portrait</option>';
        pageHtml += '<option '+(pageConfig.paperOrient==='landscape'?'selected':'')+' value="landscape">Landscape</option>';
        pageHtml += '</select></div>';

        // Font family
        pageHtml += '<div class="prop-row"><label>Default font</label><select onchange="setPageConfig(\'defaultFont\',this.value)">';
        pageHtml += '<option '+(pageConfig.defaultFont==='Roboto'?'selected':'')+' value="Roboto">Roboto</option>';
        pageHtml += '<option '+(pageConfig.defaultFont==='Times New Roman'?'selected':'')+' value="Times New Roman">Times New Roman</option>';
        if (pageConfig.customFonts) {
            pageConfig.customFonts.forEach(function(font) {
                pageHtml += '<option '+(pageConfig.defaultFont===font.name?'selected':'')+' value="'+font.name+'">'+font.name+'</option>';
            });
        }
        pageHtml += '</select></div>';
        var activeFont = pageConfig.defaultFont || 'Roboto';
        if (activeFont !== 'Roboto' && (typeof pdfMake === 'undefined' || !pdfMake.fonts || !pdfMake.fonts[activeFont])) {
            pageHtml += '<div style="color:#f38ba8; font-size:11px; margin-top:-6px; margin-bottom:8px; padding-left:74px; line-height:1.3;">⚠️ Font này chưa được tải tệp .ttf lên. PDF sẽ tự động chuyển về Roboto. Vui lòng thêm font trong phần "Custom Fonts" bên dưới.</div>';
        }
        
        // Background color
        pageHtml += '<div class="prop-row"><label>Bg color</label><input type="color" value="'+(pageConfig.bgColor||'#ffffff')+'" onchange="setPageConfig(\'bgColor\',this.value)">';
        pageHtml += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setPageConfig(\'bgColor\',\'#ffffff\')">Reset</button></div>';
        
        // Margins: Left, Top, Right, Bottom
        pageHtml += '<h3>Margins (px)</h3>';
        pageHtml += '<div class="prop-row"><label>Left (L)</label><input type="number" value="'+pageConfig.marginLeft+'" onchange="setPageConfig(\'marginLeft\',+this.value)"></div>';
        pageHtml += '<div class="prop-row"><label>Top (T)</label><input type="number" value="'+pageConfig.marginTop+'" onchange="setPageConfig(\'marginTop\',+this.value)"></div>';
        pageHtml += '<div class="prop-row"><label>Right (R)</label><input type="number" value="'+pageConfig.marginRight+'" onchange="setPageConfig(\'marginRight\',+this.value)"></div>';
        pageHtml += '<div class="prop-row"><label>Bottom (B)</label><input type="number" value="'+pageConfig.marginBottom+'" onchange="setPageConfig(\'marginBottom\',+this.value)"></div>';
        
        // Custom Fonts Section
        pageHtml += '<h3>Custom Fonts</h3>';
        if (pageConfig.customFonts && pageConfig.customFonts.length > 0) {
            pageConfig.customFonts.forEach(function(font, idx) {
                pageHtml += '<div class="prop-row" style="background:#242535; border:1px solid #313244; padding:6px; border-radius:6px; margin:4px 0; justify-content:space-between; align-items:center;">';
                pageHtml += '<span style="font-family:\''+font.name+'\', monospace; font-size:12px; font-weight:600; color:#89b4fa;">'+font.name+'</span>';
                pageHtml += '<div style="display:flex; gap:4px;">';
                pageHtml += '<button onclick="openEditFontModal('+idx+')" style="width:auto; margin:0; padding:2px 6px; color:#89b4fa; background:transparent; border:1px solid #45475a; border-radius:4px; font-size:10px; cursor:pointer;" title="Edit font">✎</button>';
                pageHtml += '<button onclick="deleteCustomFont('+idx+')" style="width:auto; margin:0; padding:2px 6px; color:#f38ba8; background:transparent; border:1px solid #45475a; border-radius:4px; font-size:10px; cursor:pointer;" title="Delete font">✕</button>';
                pageHtml += '</div></div>';
            });
        } else {
            pageHtml += '<div style="color:#6c7086; font-size:11px; margin:4px 0 8px;">No custom fonts added yet</div>';
        }
        pageHtml += '<button onclick="openAddFontModal()" style="background:#313244; color:#89b4fa; border:1px solid #45475a; border-radius:6px; margin-top:6px; cursor:pointer; width:100%;">+ Add Custom Font</button>';

        panel.innerHTML = pageHtml;
        return;
    }
    var el = elements.find(function(e) { return e.id === selectedId; });
    if (!el) return;
    panel.setAttribute('data-el-id', el.id);
    var h = '';
    h += '<div class="prop-row"><label>Type</label><input disabled value="'+el.type+'"></div>';
    h += '<div class="prop-row"><label>Layer name</label><input type="text" value="'+(el.customName||'')+'" onchange="setProp(\'customName\',this.value)" placeholder="Layer name..."></div>';
    
    // Group X and Y into a single Position row
    if (el.type !== 'pagebreak' && el.type !== 'emptyline') {
        h += '<div class="prop-row"><label>Position</label>' +
             '<div style="display:flex; gap:4px; flex:1; min-width:0;">' +
             '<input type="number" value="'+el.x+'" onchange="setProp(\'x\',+this.value)" style="min-width:0; flex:1;">' +
             '<input type="number" value="'+el.y+'" onchange="setProp(\'y\',+this.value)" style="min-width:0; flex:1;">' +
             '</div></div>';
    } else {
        h += '<div class="prop-row"><label>Position</label>' +
             '<input type="number" value="'+el.y+'" onchange="setProp(\'y\',+this.value)">' +
             '</div>';
    }

    if (el.type !== 'pagebreak' && el.type !== 'emptyline') {
        var useShowFx = !!el.useShowFx;
        h += '<div class="prop-row"><label>Visibility (Fx)</label>' +
             '<div style="display:flex; align-items:center; gap:6px; flex:1;">' +
             '<input type="checkbox" '+(useShowFx?'checked':'')+' onchange="toggleUseShowFx('+el.id+', this.checked)">' +
             (useShowFx ? '<button onclick="openFxEditor('+el.id+', \'showFx\')" style="width:auto; margin:0; padding:2px 8px; background:#89b4fa; color:#1e1e2e; border:1px solid #89b4fa; border-radius:4px; font-weight:bold; cursor:pointer;" title="Edit visibility expression">{Fx}</button>' : '') +
             '</div></div>';
        if (useShowFx && el.showFx) {
            var showFxPreview = el.showFx.length > 25 ? el.showFx.substring(0, 25) + '...' : el.showFx;
            h += '<div class="prop-row" style="color:#a6adc8; font-size:11px; padding-left:74px; margin-top:-4px; line-height:1.3; font-family:monospace; word-break:break-all; margin-bottom:8px;">Show when: ' + showFxPreview + '</div>';
        }
    }
    
    if (el.type !== 'panel' && el.type !== 'pagebreak' && el.type !== 'emptyline') {
        h += '<div class="prop-row"><label>Group</label><select onchange="changeElementParent('+el.id+', this.value)">';
        h += '<option value="" ' + (!el.parentId ? 'selected' : '') + '>-- No Group --</option>';
        elements.forEach(function(item) {
            if (item.type === 'panel') {
                h += '<option value="' + item.id + '" ' + (el.parentId === item.id ? 'selected' : '') + '>Panel #' + item.id + '</option>';
            }
        });
        h += '</select></div>';
    }

    if (el.type === 'text') {
        var isFx = !!el.isFx;
        h += '<div class="prop-row"><label>Use Fx</label>' +
             '<div style="display:flex; align-items:center; gap:6px; flex:1;">' +
             '<input type="checkbox" '+(isFx?'checked':'')+' onchange="toggleUseTextFx('+el.id+', this.checked)">' +
             (isFx ? '<button onclick="openFxEditor('+el.id+', \'fxExpr\')" style="width:auto; margin:0; padding:2px 8px; background:#89b4fa; color:#1e1e2e; border:1px solid #89b4fa; border-radius:4px; font-weight:bold; cursor:pointer;" title="Edit Fx expression">{Fx}</button>' : '') +
             '</div></div>';
        if (isFx) {
            if (el.fxExpr) {
                var exprPreview = el.fxExpr.length > 25 ? el.fxExpr.substring(0, 25) + '...' : el.fxExpr;
                h += '<div class="prop-row" style="color:#a6adc8; font-size:11px; padding-left:74px; margin-top:-4px; line-height:1.3; font-family:monospace; word-break:break-all;">Fx: ' + exprPreview + '</div>';
            }
        } else {
            h += '<div class="prop-row"><label>Text</label><textarea onchange="setProp(\'text\',this.value)">'+el.text+'</textarea></div>';
        }
        h += '<div class="prop-row"><label>Font family</label><select onchange="setProp(\'font\',this.value)">';
        h += '<option '+(el.font==='' || !el.font?'selected':'')+' value="">-- Inherit default --</option>';
        h += '<option '+(el.font==='Roboto'?'selected':'')+' value="Roboto">Roboto</option>';
        h += '<option '+(el.font==='Times New Roman'?'selected':'')+' value="Times New Roman">Times New Roman</option>';
        if (pageConfig.customFonts) {
            pageConfig.customFonts.forEach(function(font) {
                h += '<option '+(el.font===font.name?'selected':'')+' value="'+font.name+'">'+font.name+'</option>';
            });
        }
        h += '</select></div>';
        var activeElFont = el.font;
        if (activeElFont && activeElFont !== 'Roboto' && (typeof pdfMake === 'undefined' || !pdfMake.fonts || !pdfMake.fonts[activeElFont])) {
            h += '<div style="color:#f38ba8; font-size:11px; margin-top:-6px; margin-bottom:8px; padding-left:74px; line-height:1.3;">⚠️ Font này chưa được tải tệp .ttf lên. PDF sẽ tự động chuyển về Roboto. Vui lòng thêm font trong cài đặt Trang.</div>';
        }
        h += '<div class="prop-row"><label>Font size</label><input type="number" value="'+el.fontSize+'" onchange="setProp(\'fontSize\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Width</label><input type="text" value="'+el.width+'" onchange="setProp(\'width\',isNaN(this.value)||this.value.trim()===\'\'?this.value:+this.value)"></div>';
        h += '<div class="prop-row"><label>Bold</label><input type="checkbox" '+(el.bold?'checked':'')+' onchange="setProp(\'bold\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Italic</label><input type="checkbox" '+(el.italic?'checked':'')+' onchange="setProp(\'italic\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Align</label><select onchange="setProp(\'align\',this.value)"><option '+(el.align==='left'?'selected':'')+'>left</option><option '+(el.align==='center'?'selected':'')+'>center</option><option '+(el.align==='right'?'selected':'')+'>right</option></select></div>';
        
        var isColorFx = !!el.isColorFx;
        h += '<div class="prop-row"><label>Color</label>' +
             '<div style="display:flex; align-items:center; gap:6px; flex:1;">' +
             (isColorFx ? '<span style="font-size:11px; color:#89b4fa; flex:1;">Dynamic (Fx)</span>' : '<input type="color" value="'+((el.color && el.color.startsWith('#')) ? el.color : '#000000')+'" onchange="setProp(\'color\',this.value)" style="width:32px; height:24px; padding:0; flex:none;">') +
             '<input type="checkbox" '+(isColorFx?'checked':'')+' onchange="toggleUseColorFx('+el.id+', this.checked)" title="Use Fx for text color">' +
             (isColorFx ? '<button onclick="openFxEditor('+el.id+', \'colorFx\')" style="width:auto; margin:0; padding:2px 8px; background:#89b4fa; color:#1e1e2e; border:1px solid #89b4fa; border-radius:4px; font-weight:bold; cursor:pointer;" title="Edit color expression">{Fx}</button>' : '') +
             '</div></div>';
        if (isColorFx && el.colorFx) {
            var colorFxPreview = el.colorFx.length > 25 ? el.colorFx.substring(0, 25) + '...' : el.colorFx;
            h += '<div class="prop-row" style="color:#a6adc8; font-size:11px; padding-left:74px; margin-top:-4px; line-height:1.3; font-family:monospace; word-break:break-all;">Color Fx: ' + colorFxPreview + '</div>';
        }
        var isWrap = el.wrap !== false;
        h += '<div class="prop-row"><label>Auto wrap</label><input type="checkbox" '+(isWrap?'checked':'')+' onchange="setProp(\'wrap\',this.checked)"></div>';
    }
    if (el.type === 'var') {
        var isFx = !!el.isFx;
        h += '<div class="prop-row"><label>Use Fx</label>' +
             '<div style="display:flex; align-items:center; gap:6px; flex:1;">' +
             '<input type="checkbox" '+(isFx?'checked':'')+' onchange="toggleUseVarFx('+el.id+', this.checked)">' +
             (isFx ? '<button onclick="openFxEditor('+el.id+', \'fxExpr\')" style="width:auto; margin:0; padding:2px 8px; background:#89b4fa; color:#1e1e2e; border:1px solid #89b4fa; border-radius:4px; font-weight:bold; cursor:pointer;" title="Edit Fx expression">{Fx}</button>' : '') +
             '</div></div>';
        if (isFx) {
            if (el.fxExpr) {
                var exprPreview = el.fxExpr.length > 25 ? el.fxExpr.substring(0, 25) + '...' : el.fxExpr;
                h += '<div class="prop-row" style="color:#a6adc8; font-size:11px; padding-left:74px; margin-top:-4px; line-height:1.3; font-family:monospace; word-break:break-all;">Fx: ' + exprPreview + '</div>';
            }
        } else {
            h += '<div class="prop-row"><label>Variable</label><select onchange="setProp(\'varName\',this.value)">';
            Object.keys(variables).forEach(function(k) { h += '<option '+(el.varName===k?'selected':'')+' value="'+k+'">'+k+'</option>'; });
            h += '</select></div>';
        }
        h += '<div class="prop-row"><label>Prefix</label><input value="'+(el.prefix||'')+'" onchange="setProp(\'prefix\',this.value)"></div>';
        h += '<div class="prop-row"><label>Font family</label><select onchange="setProp(\'font\',this.value)">';
        h += '<option '+(el.font==='' || !el.font?'selected':'')+' value="">-- Inherit default --</option>';
        h += '<option '+(el.font==='Roboto'?'selected':'')+' value="Roboto">Roboto</option>';
        h += '<option '+(el.font==='Times New Roman'?'selected':'')+' value="Times New Roman">Times New Roman</option>';
        if (pageConfig.customFonts) {
            pageConfig.customFonts.forEach(function(font) {
                h += '<option '+(el.font===font.name?'selected':'')+' value="'+font.name+'">'+font.name+'</option>';
            });
        }
        h += '</select></div>';
        var activeElFont = el.font;
        if (activeElFont && activeElFont !== 'Roboto' && (typeof pdfMake === 'undefined' || !pdfMake.fonts || !pdfMake.fonts[activeElFont])) {
            h += '<div style="color:#f38ba8; font-size:11px; margin-top:-6px; margin-bottom:8px; padding-left:74px; line-height:1.3;">⚠️ Font này chưa được tải tệp .ttf lên. PDF sẽ tự động chuyển về Roboto. Vui lòng thêm font trong cài đặt Trang.</div>';
        }
        h += '<div class="prop-row"><label>Font size</label><input type="number" value="'+el.fontSize+'" onchange="setProp(\'fontSize\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Width</label><input type="text" value="'+el.width+'" onchange="setProp(\'width\',isNaN(this.value)||this.value.trim()===\'\'?this.value:+this.value)"></div>';
        h += '<div class="prop-row"><label>Bold</label><input type="checkbox" '+(el.bold?'checked':'')+' onchange="setProp(\'bold\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Italic</label><input type="checkbox" '+(el.italic?'checked':'')+' onchange="setProp(\'italic\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Align</label><select onchange="setProp(\'align\',this.value)"><option '+(el.align==='left'?'selected':'')+'>left</option><option '+(el.align==='center'?'selected':'')+'>center</option><option '+(el.align==='right'?'selected':'')+'>right</option></select></div>';
        
        var isColorFx = !!el.isColorFx;
        h += '<div class="prop-row"><label>Text color</label>' +
             '<div style="display:flex; align-items:center; gap:6px; flex:1;">' +
             (isColorFx ? '<span style="font-size:11px; color:#89b4fa; flex:1;">Dynamic (Fx)</span>' : '<input type="color" value="'+((el.color && el.color.startsWith('#')) ? el.color : '#000000')+'" onchange="setProp(\'color\',this.value)" style="width:32px; height:24px; padding:0; flex:none;">') +
             '<input type="checkbox" '+(isColorFx?'checked':'')+' onchange="toggleUseColorFx('+el.id+', this.checked)" title="Use Fx for text color">' +
             (isColorFx ? '<button onclick="openFxEditor('+el.id+', \'colorFx\')" style="width:auto; margin:0; padding:2px 8px; background:#89b4fa; color:#1e1e2e; border:1px solid #89b4fa; border-radius:4px; font-weight:bold; cursor:pointer;" title="Edit color expression">{Fx}</button>' : '') +
             '</div></div>';
        if (isColorFx && el.colorFx) {
            var colorFxPreview = el.colorFx.length > 25 ? el.colorFx.substring(0, 25) + '...' : el.colorFx;
            h += '<div class="prop-row" style="color:#a6adc8; font-size:11px; padding-left:74px; margin-top:-4px; line-height:1.3; font-family:monospace; word-break:break-all;">Color Fx: ' + colorFxPreview + '</div>';
        }
        var isWrap = el.wrap !== false;
        h += '<div class="prop-row"><label>Auto wrap</label><input type="checkbox" '+(isWrap?'checked':'')+' onchange="setProp(\'wrap\',this.checked)"></div>';
    }
    if (el.type === 'line') {
        h += '<div class="prop-row"><label>Length</label><input type="number" value="'+el.lineWidth+'" onchange="setProp(\'lineWidth\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Thickness</label><input type="number" step="0.5" value="'+el.lineWeight+'" onchange="setProp(\'lineWeight\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Color</label><input type="color" value="'+((el.color && el.color.startsWith('#')) ? el.color : '#000000')+'" onchange="setProp(\'color\',this.value)"></div>';
    }
    if (el.type === 'rect') {
        h += '<div class="prop-row"><label>Width</label><input type="number" value="'+el.rectW+'" onchange="setProp(\'rectW\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Height</label><input type="number" value="'+el.rectH+'" onchange="setProp(\'rectH\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Radius</label><input type="number" value="'+el.radius+'" onchange="setProp(\'radius\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Border</label><input type="number" step="0.5" value="'+el.lineWeight+'" onchange="setProp(\'lineWeight\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Border color</label><input type="color" value="'+((el.color && el.color.startsWith('#')) ? el.color : '#000000')+'" onchange="setProp(\'color\',this.value)"></div>';
    }
    if (el.type === 'shape') {
        h += '<div class="prop-row"><label>Shape type</label><select onchange="setProp(\'shapeType\',this.value)">';
        h += '<option value="rect" '+(el.shapeType==='rect'?'selected':'')+'>Rectangle</option>';
        h += '<option value="line" '+(el.shapeType==='line'?'selected':'')+'>Line</option>';
        h += '<option value="ellipse" '+(el.shapeType==='ellipse'?'selected':'')+'>Circle/Ellipse</option>';
        h += '<option value="polygon" '+(el.shapeType==='polygon'?'selected':'')+'>Polygon/Polyline</option>';
        h += '</select></div>';
        
        h += '<div class="prop-row"><label>Width (W)</label><input type="text" value="'+el.width+'" onchange="setProp(\'width\',isNaN(this.value)||this.value.trim()===\'\'?this.value:+this.value)"></div>';
        h += '<div class="prop-row"><label>Height (H)</label><input type="number" value="'+el.height+'" onchange="setProp(\'height\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Border width</label><input type="number" step="0.5" value="'+el.lineWidth+'" onchange="setProp(\'lineWidth\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Border color</label><input type="color" value="'+((el.color && el.color.startsWith('#')) ? el.color : '#000000')+'" onchange="setProp(\'color\',this.value)"></div>';
        h += '<div class="prop-row"><label>Rotation (°)</label><input type="number" value="'+(el.rotate||0)+'" onchange="setProp(\'rotate\',+this.value)" min="-360" max="360"></div>';
        
        if (el.shapeType !== 'line') {
            h += '<div class="prop-row"><label>Fill color</label><input type="color" value="'+((el.fillColor && el.fillColor.startsWith('#')) ? el.fillColor : '#ffffff')+'" onchange="setProp(\'fillColor\',this.value)">';
            h += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setProp(\'fillColor\',\'\')">Clear fill</button></div>';
        }
        
        if (el.shapeType === 'rect') {
            h += '<div class="prop-row"><label>Radius (rx)</label><input type="number" value="'+(el.radius||0)+'" onchange="setProp(\'radius\',+this.value)"></div>';
        }
        
        if (el.shapeType === 'polygon') {
            var sides = el.sides || 3;
            h += '<div class="prop-row"><label>Sides</label><input type="number" min="3" max="50" value="'+sides+'" onchange="setProp(\'sides\',+this.value); generatePolygonPointsFromSides();"></div>';
            h += '<div class="prop-row" style="align-items:flex-start;"><label>Points</label>';
            h += '<textarea id="polygonPointsTextarea" onchange="setProp(\'points\',this.value)" placeholder="x1,y1 x2,y2 x3,y3" style="height:60px;">'+(el.points||'')+'</textarea></div>';
            h += '<div class="prop-row"><label>Closed</label><input type="checkbox" '+(el.close?'checked':'')+' onchange="setProp(\'close\',this.checked)"></div>';
        }
    }
    if (el.type === 'image') {
        h += '<div class="prop-row"><label>Bind variable</label><select onchange="setProp(\'dataVar\',this.value)"><option value="">-- None --</option>';
        Object.keys(variables).forEach(function(k) {
            if (isImageVal(variables[k])) {
                h += '<option '+(el.dataVar===k?'selected':'')+' value="'+k+'">'+k+'</option>';
            }
        });
        h += '</select></div>';
        
        var isVarBound = !!el.dataVar;
        h += '<div class="prop-row"><label>Image source</label><input type="text" value="'+(isVarBound ? 'From variable: ' + el.dataVar : (el.imageSrc.startsWith('data:') ? 'Embedded Base64 Image' : el.imageSrc))+'" ' + (isVarBound || el.imageSrc.startsWith('data:') ? 'disabled' : '') + ' onchange="setProp(\'imageSrc\',this.value)" placeholder="Enter image URL..."></div>';
        
        if (!isVarBound) {
            h += '<div class="prop-row"><label>Upload image</label><input type="file" accept="image/*,image/svg+xml" onchange="uploadImage(event)" style="display:none;" id="imgUploadInput">';
            h += '<button onclick="document.getElementById(\'imgUploadInput\').click()" style="background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;">Choose image file...</button></div>';
            var defaultBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAADFLCArAAAAA1BMVEUzMzMrj16bAAAAR0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3wA7gAAB6PpYEwAAAABJRU5ErkJggg==';
            if (el.imageSrc && el.imageSrc !== defaultBase64 && el.imageSrc.startsWith('data:')) {
                h += '<div class="prop-row"><label></label><button onclick="setProp(\'imageSrc\',\''+defaultBase64+'\')" style="background:#313244;color:#f38ba8;border:1px solid #f38ba8;border-radius:4px;cursor:pointer;">Delete image</button></div>';
            }
        } else {
            var valPreview = variables[el.dataVar] ? variables[el.dataVar].toString() : '';
            if (valPreview.length > 25) valPreview = valPreview.substring(0, 25) + '...';
            h += '<div class="prop-row" style="color: #89b4fa; font-size: 11px; padding-left: 74px;">Variable value: ' + valPreview + '</div>';
        }
        
        h += '<div class="prop-row"><label>Width (W)</label><input type="text" value="'+el.width+'" onchange="setProp(\'width\',isNaN(this.value)||this.value.trim()===\'\'?this.value:+this.value)"></div>';
        h += '<div class="prop-row"><label>Height (H)</label><input type="number" value="'+el.height+'" onchange="setProp(\'height\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Rotation (°)</label><input type="number" value="'+(el.rotate||0)+'" onchange="setProp(\'rotate\',+this.value)" min="-360" max="360"></div>';
    }
    if (el.type === 'table') {
        h += '<div class="prop-row"><label>Show header</label><input type="checkbox" '+(el.showHeader!==false?'checked':'')+' onchange="setProp(\'showHeader\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Bind variable</label><select onchange="setProp(\'dataVar\',this.value)"><option value="">-- None --</option>';
        Object.keys(variables).forEach(function(k) {
            if (Array.isArray(variables[k])) {
                h += '<option '+(el.dataVar===k?'selected':'')+' value="'+k+'">'+k+'</option>';
            }
        });
        h += '</select></div>';
        var colSummary = getColumnsSummary(el);
        h += '<div class="prop-row"><label>Columns</label><button onclick="openColumnsEditor('+el.id+')" style="width:auto; flex:1; margin:0; padding:4px 8px; background:#313244; color:#cdd6f4; border:1px solid #45475a; border-radius:4px; cursor:pointer; font-size:11px; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="Click to edit columns &amp; styles">'+colSummary+'</button></div>';
        h += '<div class="prop-row"><label>Font family</label><select onchange="setProp(\'font\',this.value)">';
        h += '<option '+(el.font==='' || !el.font?'selected':'')+' value="">-- Inherit default --</option>';
        h += '<option '+(el.font==='Roboto'?'selected':'')+' value="Roboto">Roboto</option>';
        h += '<option '+(el.font==='Times New Roman'?'selected':'')+' value="Times New Roman">Times New Roman</option>';
        if (pageConfig.customFonts) {
            pageConfig.customFonts.forEach(function(font) {
                h += '<option '+(el.font===font.name?'selected':'')+' value="'+font.name+'">'+font.name+'</option>';
            });
        }
        h += '</select></div>';
        var activeElFont = el.font;
        if (activeElFont && activeElFont !== 'Roboto' && (typeof pdfMake === 'undefined' || !pdfMake.fonts || !pdfMake.fonts[activeElFont])) {
            h += '<div style="color:#f38ba8; font-size:11px; margin-top:-6px; margin-bottom:8px; padding-left:74px; line-height:1.3;">⚠️ Font này chưa được tải tệp .ttf lên. PDF sẽ tự động chuyển về Roboto. Vui lòng thêm font trong cài đặt Trang.</div>';
        }
        h += '<div class="prop-row"><label>Font size</label><input type="number" value="'+el.fontSize+'" onchange="setProp(\'fontSize\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Table Width</label><input type="text" value="'+el.width+'" onchange="setProp(\'width\',isNaN(this.value)||this.value.trim()===\'\'?this.value:+this.value)"></div>';
        h += '<div class="prop-row"><label>Body Bold</label><input type="checkbox" '+(el.bold?'checked':'')+' onchange="setProp(\'bold\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Body Italic</label><input type="checkbox" '+(el.italic?'checked':'')+' onchange="setProp(\'italic\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Default Color</label><input type="color" value="'+((el.color && el.color.startsWith('#')) ? el.color : '#000000')+'" onchange="setProp(\'color\',this.value)"></div>';
        h += '<div class="prop-row"><label>Odd row bg</label><input type="color" value="'+((el.oddRowFill && el.oddRowFill.startsWith('#')) ? el.oddRowFill : '#ffffff')+'" onchange="setProp(\'oddRowFill\',this.value)">';
        h += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setProp(\'oddRowFill\',\'\')">Clear</button></div>';
        h += '<div class="prop-row"><label>Even row bg</label><input type="color" value="'+((el.evenRowFill && el.evenRowFill.startsWith('#')) ? el.evenRowFill : '#ffffff')+'" onchange="setProp(\'evenRowFill\',this.value)">';
        h += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setProp(\'evenRowFill\',\'\')">Clear</button></div>';
        h += '<div class="prop-row"><label>Cell Padding</label>';
        h += '<div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:4px; flex:1;">';
        h += '<div style="display:flex; flex-direction:column; align-items:center;"><span style="font-size:9px; color:#a6adc8;">Top</span><input type="number" style="width:100%; text-align:center; padding:2px; font-size:11px; background:#1e1e2e; color:#cdd6f4; border:1px solid #45475a; border-radius:4px;" min="0" value="'+(el.paddingTop!==undefined?el.paddingTop:4)+'" onchange="setProp(\'paddingTop\',+this.value)"></div>';
        h += '<div style="display:flex; flex-direction:column; align-items:center;"><span style="font-size:9px; color:#a6adc8;">Right</span><input type="number" style="width:100%; text-align:center; padding:2px; font-size:11px; background:#1e1e2e; color:#cdd6f4; border:1px solid #45475a; border-radius:4px;" min="0" value="'+(el.paddingRight!==undefined?el.paddingRight:6)+'" onchange="setProp(\'paddingRight\',+this.value)"></div>';
        h += '<div style="display:flex; flex-direction:column; align-items:center;"><span style="font-size:9px; color:#a6adc8;">Bottom</span><input type="number" style="width:100%; text-align:center; padding:2px; font-size:11px; background:#1e1e2e; color:#cdd6f4; border:1px solid #45475a; border-radius:4px;" min="0" value="'+(el.paddingBottom!==undefined?el.paddingBottom:4)+'" onchange="setProp(\'paddingBottom\',+this.value)"></div>';
        h += '<div style="display:flex; flex-direction:column; align-items:center;"><span style="font-size:9px; color:#a6adc8;">Left</span><input type="number" style="width:100%; text-align:center; padding:2px; font-size:11px; background:#1e1e2e; color:#cdd6f4; border:1px solid #45475a; border-radius:4px;" min="0" value="'+(el.paddingLeft!==undefined?el.paddingLeft:6)+'" onchange="setProp(\'paddingLeft\',+this.value)"></div>';
        h += '</div></div>';
        h += '<div class="prop-row"><label>Border</label><input type="checkbox" '+(el.showBorder?'checked':'')+' onchange="setProp(\'showBorder\',this.checked)"></div>';
        if (el.showBorder) {
            h += '<div class="prop-row"><label>Border Sides</label>';
            h += '<div style="display:flex; gap:12px; align-items:center; flex:1;">';
            h += '<label style="font-size:11px; color:#a6adc8; display:inline-flex; align-items:center; gap:3px; margin:0; width:auto !important; flex:none;"><input type="checkbox" '+(el.borderLeft!==false?'checked':'')+' onchange="setProp(\'borderLeft\',this.checked)">L</label>';
            h += '<label style="font-size:11px; color:#a6adc8; display:inline-flex; align-items:center; gap:3px; margin:0; width:auto !important; flex:none;"><input type="checkbox" '+(el.borderTop!==false?'checked':'')+' onchange="setProp(\'borderTop\',this.checked)">T</label>';
            h += '<label style="font-size:11px; color:#a6adc8; display:inline-flex; align-items:center; gap:3px; margin:0; width:auto !important; flex:none;"><input type="checkbox" '+(el.borderRight!==false?'checked':'')+' onchange="setProp(\'borderRight\',this.checked)">R</label>';
            h += '<label style="font-size:11px; color:#a6adc8; display:inline-flex; align-items:center; gap:3px; margin:0; width:auto !important; flex:none;"><input type="checkbox" '+(el.borderBottom!==false?'checked':'')+' onchange="setProp(\'borderBottom\',this.checked)">B</label>';
            h += '</div></div>';
        }
        h += '<div class="prop-row"><label>Border width</label><input type="number" step="0.5" value="'+(el.borderWidth||1)+'" onchange="setProp(\'borderWidth\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Border style</label><select onchange="setProp(\'borderStyle\',this.value)">';
        h += '<option '+(el.borderStyle==='solid'||!el.borderStyle?'selected':'')+' value="solid">Solid (Nét liền)</option>';
        h += '<option '+(el.borderStyle==='dashed'?'selected':'')+' value="dashed">Dashed (Nét đứt)</option>';
        h += '<option '+(el.borderStyle==='dotted'?'selected':'')+' value="dotted">Dotted (Chấm tròn)</option>';
        h += '</select></div>';
        h += '<div class="prop-row"><label>Border color</label><input type="color" value="'+((el.borderColor && el.borderColor.startsWith('#')) ? el.borderColor : '#000000')+'" onchange="setProp(\'borderColor\',this.value)"></div>';
    }
    if (el.type === 'panel') {
        h += '<div class="prop-row"><label>Width (W)</label><input type="text" value="'+el.width+'" onchange="setProp(\'width\',isNaN(this.value)||this.value.trim()===\'\'?this.value:+this.value)"></div>';
        h += '<div class="prop-row"><label>Height (H)</label><input type="number" value="'+el.height+'" onchange="setProp(\'height\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Bg color</label><input type="color" value="'+((el.bgColor && el.bgColor.startsWith('#')) ? el.bgColor : '#ffffff')+'" onchange="setProp(\'bgColor\',this.value)">';
        h += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setProp(\'bgColor\',\'transparent\')">Clear</button></div>';
        var showBorder = el.showBorder !== false;
        h += '<div class="prop-row"><label>Show border</label><input type="checkbox" '+(showBorder?'checked':'')+' onchange="setProp(\'showBorder\',this.checked)"></div>';
        if (showBorder) {
            h += '<div class="prop-row"><label>Border width</label><input type="number" value="'+(el.borderWidth||1)+'" onchange="setProp(\'borderWidth\',+this.value)"></div>';
            h += '<div class="prop-row"><label>Border color</label><input type="color" value="'+((el.borderColor && el.borderColor.startsWith('#')) ? el.borderColor : '#cbd5e1')+'" onchange="setProp(\'borderColor\',this.value)">';
            h += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setProp(\'borderColor\',\'transparent\')">Clear</button></div>';
        }
    }
    if (el.type === 'emptyline') {
        h += '<div class="prop-row"><label>Height (px)</label><input type="number" value="'+(el.height||20)+'" onchange="setProp(\'height\',+this.value)"></div>';
    }
    
    h += '<div style="margin-top:10px; display:flex; gap:6px;">';
    h += '<button style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px;" class="danger" onclick="deleteElement('+el.id+')"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>Delete</button>';
    h += '</div>';
    
    panel.innerHTML = h;
}

function generatePolygonPoints(sides, w, h) {
    var pts = [];
    var cx = w / 2;
    var cy = h / 2;
    var rx = w / 2;
    var ry = h / 2;
    var startAngle = -Math.PI / 2;
    for (var i = 0; i < sides; i++) {
        var angle = startAngle + (i * 2 * Math.PI / sides);
        var x = cx + rx * Math.cos(angle);
        var y = cy + ry * Math.sin(angle);
        pts.push(Math.round(x * 10) / 10 + ',' + Math.round(y * 10) / 10);
    }
    return pts.join(' ');
}

function generatePolygonPointsFromSides() {
    var targetId = selectedId;
    var propsContent = document.getElementById('propsContent');
    if (propsContent && propsContent.hasAttribute('data-el-id')) {
        targetId = parseInt(propsContent.getAttribute('data-el-id')) || selectedId;
    }
    if (!targetId) return;
    var el = elements.find(function(e) { return e.id === targetId; });
    if (!el || el.type !== 'shape' || el.shapeType !== 'polygon') return;
    
    var sides = el.sides || 3;
    var w = getParsedWidth(el.width || 100);
    var h = el.height || 50;
    
    var pointsStr = generatePolygonPoints(sides, w, h);
    el.points = pointsStr;
    
    var textarea = document.getElementById('polygonPointsTextarea');
    if (textarea) {
        textarea.value = pointsStr;
    }
    render();
}

function setProp(k, v) {
    var targetId = selectedId;
    var propsContent = document.getElementById('propsContent');
    if (propsContent && propsContent.hasAttribute('data-el-id')) {
        targetId = parseInt(propsContent.getAttribute('data-el-id')) || selectedId;
    }
    if (!targetId) return;
    saveUndo();
    var el = elements.find(function(e) { return e.id === targetId; });
    if (!el) return;
    
    if (k === 'width' && el.type === 'pagebreak') {
        return; // Pagebreak width is always '100%'
    }
    
    el[k] = v;
    
    if (el.type === 'shape') {
        if (k === 'shapeType') {
            if (v === 'polygon') {
                el.sides = el.sides || 3;
                var w = getParsedWidth(el.width || 100);
                var h = el.height || 50;
                el.points = generatePolygonPoints(el.sides, w, h);
                el.close = (el.close !== undefined) ? el.close : true;
            } else if (v === 'ellipse') {
                el.radius = undefined;
            } else if (v === 'rect') {
                el.radius = el.radius || 0;
            }
        } else if (k === 'width' || k === 'height') {
            if (el.shapeType === 'polygon' && el.sides) {
                var w = getParsedWidth(el.width || 100);
                var h = el.height || 50;
                el.points = generatePolygonPoints(el.sides, w, h);
            }
        }
    }
    
    render();
    if (k === 'shapeType' || k === 'dataVar' || k === 'isFx' || k === 'showBorder') {
        renderProps();
    }
}

function setPageConfig(k, v) {
    pageConfig[k] = v;
    render();
}

function uploadImage(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        setProp('imageSrc', ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// ============================================================
// ELEMENTS OUTLINE
// ============================================================
function renderOutline() {
    var outline = document.getElementById('elementsOutline');
    if (!outline) return;
    
    if (elements.length === 0) {
        outline.innerHTML = '<span style="color:#6c7086; font-size:11px; padding: 4px;">No elements added yet</span>';
        return;
    }
    
    var html = '';
    
    function renderElementOutlineItem(el, depth) {
        var isSelected = (selectedIds.indexOf(el.id) !== -1);
        var label = getElementOutlineLabel(el);
        var typeStr = el.type;
        if (el.type === 'shape') {
            typeStr = el.shapeType || 'shape';
        }
        
        var indentStyle = depth > 0 ? ' margin-left: ' + (depth * 16) + 'px;' : '';
        var indentPrefix = depth > 0 ? '<span style="color:#6c7086; margin-right:4px;">↳</span>' : '';
        var isVisible = isElementVisible(el, variables);
        var opacityStyle = isVisible ? '' : ' opacity: 0.65;';
        
        html += '<div class="outline-item' + (isSelected ? ' selected' : '') + '" style="cursor:pointer;' + indentStyle + opacityStyle + '" onclick="selectElement(' + el.id + ', event)">';
        html += '<div class="el-info">';
        html += indentPrefix;
        html += '<span class="el-type-badge">' + typeStr.toUpperCase() + '</span>';
        html += '<span ondblclick="renameElementOutline(' + el.id + ', event)" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85px; font-size:11px;" title="Double click to rename: ' + label + '">' + label + '</span>';
        html += '</div>';
        html += '<div class="actions" onclick="event.stopPropagation();">';
        html += '<span onclick="renameElementOutline(' + el.id + ', event)" style="cursor:pointer; color:#89b4fa; display:inline-flex; align-items:center;" title="Rename layer"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></span>';
        html += '<span onclick="moveElement(' + el.id + ', \'down\')" style="cursor:pointer; color:#a6adc8; display:inline-flex; align-items:center;" title="Bring forward (z-index)"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></span>';
        html += '<span onclick="moveElement(' + el.id + ', \'up\')" style="cursor:pointer; color:#a6adc8; display:inline-flex; align-items:center;" title="Send backward (z-index)"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg></span>';
        html += '<span onclick="deleteElement(' + el.id + ')" style="cursor:pointer; color:#f38ba8; display:inline-flex; align-items:center;" title="Delete"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></span>';
        html += '</div>';
        html += '</div>';
        
        if (el.type === 'panel') {
            var children = elements.filter(function(child) { return child.parentId === el.id; }).reverse();
            children.forEach(function(child) {
                renderElementOutlineItem(child, depth + 1);
            });
        }
    }
    
    var topLevel = elements.filter(function(el) {
        if (!el.parentId) return true;
        var parentExists = elements.some(function(item) { return item.id === el.parentId; });
        return !parentExists;
    });
    
    var topLevelNonPanels = topLevel.filter(function(el) { return el.type !== 'panel'; }).reverse();
    var topLevelPanels = topLevel.filter(function(el) { return el.type === 'panel'; }).reverse();
    var sortedTopLevel = topLevelNonPanels.concat(topLevelPanels);
    
    sortedTopLevel.forEach(function(el) {
        renderElementOutlineItem(el, 0);
    });
    
    outline.innerHTML = html;
}

function renameElementOutline(id, event) {
    if (event) event.stopPropagation();
    var el = elements.find(function(e) { return e.id === id; });
    if (!el) return;
    
    var defaultName = el.customName || '';
    var newName = prompt("Enter new layer name for element:", defaultName);
    if (newName !== null) {
        el.customName = newName.trim();
        render();
        renderProps();
    }
}

function getElementOutlineLabel(el) {
    if (el.customName && el.customName.trim() !== '') {
        return el.customName;
    }
    switch(el.type) {
        case 'text':
            if (el.isFx) {
                return el.fxExpr ? 'Fx: ' + el.fxExpr : 'Text (Fx)';
            }
            return el.text || 'Text';
        case 'var':
            return '{' + el.varName + '}';
        case 'line':
            return 'Line (W: ' + el.lineWidth + ')';
        case 'rect':
            return 'Rectangle (W: ' + el.rectW + ', H: ' + el.rectH + ')';
        case 'shape':
            var types = { rect: 'Rect', line: 'Line', ellipse: 'Circle/Ellipse', polygon: 'Polygon' };
            return (types[el.shapeType] || 'Shape') + ' (' + el.width + 'x' + el.height + ')';
        case 'image':
            return el.dataVar ? 'Image {' + el.dataVar + '}' : 'Image';
        case 'table':
            return 'Table (' + el.headers.length + ' cols)';
        case 'panel':
            return 'Panel #' + el.id;
        case 'pagebreak':
            return 'Page Break (Y: ' + el.y + ')';
        case 'emptyline':
            return 'Empty Line (' + (el.height || 20) + 'px)';
    }
    return 'Element';
}

// ============================================================
// VARIABLES LIST
// ============================================================
function renderVarList() {
    var html = '';
    Object.keys(variables).forEach(function(k) {
        var val = variables[k];
        var isArr = Array.isArray(val);
        var isImg = isImageVal(val);
        
        var svgIcon = '';
        if (isArr) {
            svgIcon = '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="10" y1="3" x2="10" y2="21"></line></svg>';
        } else if (isImg) {
            svgIcon = '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
        } else {
            svgIcon = '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"></path><path d="M20 5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"></path><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>';
        }
        var label = k + (isArr ? ' (Array)' : (isImg ? ' (Image)' : ''));
        
        html += '<div class="pal-item" style="font-size:11px; display:flex; justify-content:space-between; align-items:center; width:100%; padding: 4px 6px;">';
        if (isArr) {
            html += '<div style="display:flex; align-items:center; gap:6px; opacity:0.8; cursor:default; flex:1;" title="Array variable for binding to tables"><span class="icon" style="display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px;">' + svgIcon + '</span>' + label + '</div>';
        } else {
            html += '<div onclick="addVarElement(\''+k+'\')" style="display:flex; align-items:center; gap:6px; cursor:pointer; flex:1;" title="Click to add to report"><span class="icon" style="display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px;">'+svgIcon+'</span>'+k+'</div>';
        }
        html += '<div style="display:flex; gap:6px; align-items:center;">';
        html += '<span onclick="editVar(\''+k+'\', event)" style="cursor:pointer; color:#89b4fa; display:inline-flex; align-items:center;" title="Edit variable"><svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></span>';
        html += '<span onclick="deleteVar(\''+k+'\', event)" style="cursor:pointer; color:#f38ba8; display:inline-flex; align-items:center;" title="Delete variable"><svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></span>';
        html += '</div>';
        html += '</div>';
    });
    document.getElementById('varList').innerHTML = html;
}

function addVarElement(key) {
    var val = variables[key];
    var isImg = isImageVal(val);
    
    var el = { id: ++idCounter, x: 20, y: 20 + elements.length * 24, showFx: '', useShowFx: false, isColorFx: false, colorFx: '' };
    if (isImg) {
        Object.assign(el, { type:'image', imageSrc:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAADFLCArAAAAA1BMVEUzMzMrj16bAAAAR0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3wA7gAAB6PpYEwAAAABJRU5ErkJggg==', width:100, height:100, dataVar:key, rotate:0 });
    } else {
        Object.assign(el, { type:'var', varName:key, fontSize:13, bold:false, italic:false, align:'left', color:'#000000', prefix:'', width:200, isFx:false, fxExpr:'' });
    }
    elements.push(el);
    selectElement(el.id);
    render();
}

function addNewVar() {
    document.getElementById('varModalTitle').textContent = 'Add New Variable';
    document.getElementById('varNameInput').value = '';
    document.getElementById('varNameInput').disabled = false;
    document.getElementById('varTypeSelect').value = 'string';
    document.getElementById('varValueInput').value = '';
    document.getElementById('varValueInput').placeholder = 'Enter mock string value';
    document.getElementById('varImageUrlInput').value = '';
    document.getElementById('varImagePreview').src = '';
    document.getElementById('varImagePreview').style.display = 'none';
    document.getElementById('varImagePreviewPlaceholder').style.display = 'block';
    onVarTypeChange();
    document.getElementById('varModal').classList.add('show');
}

function onVarTypeChange() {
    var type = document.getElementById('varTypeSelect').value;
    var textareaRow = document.getElementById('varTextareaRow');
    var imageInputs = document.getElementById('varImageInputs');
    
    if (type === 'image') {
        textareaRow.style.display = 'none';
        imageInputs.style.display = 'flex';
        var preview = document.getElementById('varImagePreview');
        var placeholder = document.getElementById('varImagePreviewPlaceholder');
        var urlInput = document.getElementById('varImageUrlInput');
        if (urlInput.value) {
            preview.src = urlInput.value;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            preview.src = '';
            preview.style.display = 'none';
            placeholder.style.display = 'block';
        }
    } else {
        textareaRow.style.display = 'flex';
        imageInputs.style.display = 'none';
        
        var valInput = document.getElementById('varValueInput');
        if (type === 'array') {
            if (!valInput.value || valInput.value.trim() === '' || !valInput.value.trim().startsWith('[')) {
                valInput.value = JSON.stringify([
                    { stt: 1, ten: "Sản phẩm A", so_luong: 2, don_vi_tinh: "Cái" },
                    { stt: 2, ten: "Sản phẩm B", so_luong: 5, don_vi_tinh: "Cái" }
                ], null, 2);
            }
            valInput.placeholder = "Nhập JSON mảng (VD: [{\"stt\":1, ...}])";
        } else {
            if (valInput.value.trim().startsWith('[')) {
                valInput.value = "";
            }
            valInput.placeholder = "Nhập giá trị chữ mẫu";
        }
    }
}

function onVarImageUrlInput() {
    var url = document.getElementById('varImageUrlInput').value.trim();
    var preview = document.getElementById('varImagePreview');
    var placeholder = document.getElementById('varImagePreviewPlaceholder');
    if (url) {
        preview.src = url;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        preview.src = '';
        preview.style.display = 'none';
        placeholder.style.display = 'block';
    }
}

function onVarImageFileChange(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        document.getElementById('varImageUrlInput').value = ev.target.result;
        var preview = document.getElementById('varImagePreview');
        var placeholder = document.getElementById('varImagePreviewPlaceholder');
        preview.src = ev.target.result;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function closeVarModal() {
    document.getElementById('varModal').classList.remove('show');
}

function saveVar() {
    var name = document.getElementById('varNameInput').value.trim();
    if (!name) {
        alert('Vui lòng nhập tên biến!');
        return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
        alert('Tên biến chỉ được chứa chữ cái, số và dấu gạch dưới!');
        return;
    }

    var type = document.getElementById('varTypeSelect').value;
    var val;
    
    if (type === 'image') {
        val = document.getElementById('varImageUrlInput').value.trim();
        if (!val) {
            alert('Vui lòng nhập URL ảnh hoặc chọn tệp ảnh local!');
            return;
        }
    } else if (type === 'array') {
        var rawVal = document.getElementById('varValueInput').value;
        try {
            val = JSON.parse(rawVal);
            if (!Array.isArray(val)) {
                alert('Dữ liệu mảng phải bắt đầu bằng [ và kết thúc bằng ] (JSON Array)!');
                return;
            }
        } catch (e) {
            alert('Lỗi định dạng JSON mảng: ' + e.message);
            return;
        }
    } else {
        val = document.getElementById('varValueInput').value;
    }

    variables[name] = val;
    closeVarModal();
    render();
    renderProps();
}

function editVar(key, event) {
    if (event) event.stopPropagation();
    var val = variables[key];
    var isArr = Array.isArray(val);
    var isImg = isImageVal(val);
    
    document.getElementById('varModalTitle').textContent = 'Sửa Biến';
    document.getElementById('varNameInput').value = key;
    document.getElementById('varNameInput').disabled = true;
    
    if (isImg) {
        document.getElementById('varTypeSelect').value = 'image';
        document.getElementById('varImageUrlInput').value = val;
        var preview = document.getElementById('varImagePreview');
        var placeholder = document.getElementById('varImagePreviewPlaceholder');
        preview.src = val;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        document.getElementById('varTypeSelect').value = isArr ? 'array' : 'string';
        document.getElementById('varValueInput').value = isArr ? JSON.stringify(val, null, 2) : val;
        document.getElementById('varValueInput').placeholder = isArr ? "Nhập JSON mảng (VD: [{\"stt\":1, ...}])" : "Nhập giá trị chữ mẫu";
    }
    
    onVarTypeChange();
    document.getElementById('varModal').classList.add('show');
}

function deleteVar(key, event) {
    if (event) event.stopPropagation();
    if (confirm('Bạn có chắc muốn xóa biến "' + key + '"?')) {
        delete variables[key];
        render();
    }
}

function parsePoints(pointsStr) {
    var pts = [];
    var arr = (pointsStr || '').trim().split(/\s+/);
    arr.forEach(function(p) {
        var xy = p.split(',');
        if (xy.length === 2) {
            pts.push({ x: parseFloat(xy[0]) || 0, y: parseFloat(xy[1]) || 0 });
        }
    });
    return pts;
}

// ============================================================
// BUILD PDFMAKE DOCUMENT
// ============================================================
function getElementWidth(el) {
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
        return getParsedWidth(el.width) || 500;
    }
    if (el.type === 'text' || el.type === 'var' || el.type === 'shape' || el.type === 'image' || el.type === 'panel') {
        var w = getParsedWidth(el.width) || 100;
        return (el.type === 'text' || el.type === 'var') ? Math.max(20, w) : w;
    }
    if (el.type === 'line') {
        return getParsedWidth(el.lineWidth) || 100;
    }
    if (el.type === 'rect') {
        return getParsedWidth(el.rectW) || 100;
    }
    return 100;
}

function elementToNode(el, imagesDict) {
    switch(el.type) {
        case 'text':
            var displayText = el.text;
            if (el.isFx) {
                displayText = el.fxExpr ? evaluateFx(el.fxExpr, variables) : '';
            }
            var textColor = el.color;
            if (el.isColorFx && el.colorFx) {
                var evaluatedColor = evaluateFx(el.colorFx, variables);
                if (evaluatedColor && !evaluatedColor.startsWith('Fx Error:')) {
                    textColor = evaluatedColor;
                }
            }
            return { text: parseHtmlToPdfText(displayText), fontSize: el.fontSize, bold: el.bold, italics: el.italic, alignment: el.align, color: textColor, width: getParsedWidth(el.width), noWrap: el.wrap === false ? true : undefined, font: getElementEffectiveFont(el.font) };
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
            return { text: parseHtmlToPdfText(val), fontSize: el.fontSize, bold: el.bold, italics: el.italic, alignment: el.align, color: textColor, width: getParsedWidth(el.width), noWrap: el.wrap === false ? true : undefined, font: getElementEffectiveFont(el.font) };
        case 'line':
            return { canvas: [{ type:'line', x1:0, y1:0, x2:el.lineWidth, y2:0, lineWidth:el.lineWeight, lineColor:el.color }] };
        case 'emptyline':
            return { text: ' ', fontSize: 1, margin: [0, 0, 0, (el.height || 20)] };
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
            var tableW = getElementWidth(el);
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
                        var resolved = resolveFieldValue(fields[i], item, rIdx);
                        if (resolved !== undefined) {
                            row.push(resolved);
                        } else {
                            row.push((keys[i] !== undefined && item[keys[i]] !== undefined) ? item[keys[i]] : '');
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
                    return {
                        text: h,
                        bold: el.headerBold !== false,
                        alignment: pdfHAligns[i] || pdfHAligns[0] || 'center',
                        fillColor: cellBg || undefined,
                        border: cellBorder
                    };
                }));
            }
            displayData.forEach(function(row, rIdx) {
                body.push(row.map(function(c,i) {
                    var isEvenRow = (rIdx % 2 === 1);
                    var rowBg = isEvenRow ? evenFill : oddFill;
                    var cellBg = colFills[i] || rowBg || '';
                    var cellText = parseHtmlToPdfText(c);
                    return {
                        text: cellText,
                        alignment: pdfBAligns[i] || pdfBAligns[0] || 'left',
                        bold: el.bold || false,
                        italics: el.italic || false,
                        fillColor: cellBg || undefined,
                        border: cellBorder
                    };
                }));
            });
            var tblLayout = {
                hLineWidth: function() { return el.showBorder ? (el.borderWidth||1) : 0; },
                vLineWidth: function() { return el.showBorder ? (el.borderWidth||1) : 0; },
                hLineColor: function() { return el.borderColor||'#000'; },
                vLineColor: function() { return el.borderColor||'#000'; },
                hLineStyle: function() {
                    if (!el.showBorder || !el.borderStyle || el.borderStyle === 'solid') return null;
                    if (el.borderStyle === 'dashed') return { dash: { length: 4, space: 2 } };
                    if (el.borderStyle === 'dotted') return { dash: { length: 1, space: 2 } };
                    return null;
                },
                vLineStyle: function() {
                    if (!el.showBorder || !el.borderStyle || el.borderStyle === 'solid') return null;
                    if (el.borderStyle === 'dashed') return { dash: { length: 4, space: 2 } };
                    if (el.borderStyle === 'dotted') return { dash: { length: 1, space: 2 } };
                    return null;
                },
                paddingLeft: function() {
                    return (el.paddingLeft !== undefined && el.paddingLeft !== '') ? parseFloat(el.paddingLeft) : 6;
                },
                paddingRight: function() {
                    return (el.paddingRight !== undefined && el.paddingRight !== '') ? parseFloat(el.paddingRight) : 6;
                },
                paddingTop: function() {
                    return (el.paddingTop !== undefined && el.paddingTop !== '') ? parseFloat(el.paddingTop) : 4;
                },
                paddingBottom: function() {
                    return (el.paddingBottom !== undefined && el.paddingBottom !== '') ? parseFloat(el.paddingBottom) : 4;
                }
            };
            return { table: { headerRows: showH ? 1 : 0, widths: widths, body: body }, layout: tblLayout, fontSize: el.fontSize, color: el.color||'#000', font: getElementEffectiveFont(el.font) };
        case 'image':
            if (el.imageSrc) {
                var src = el.imageSrc;
                if (el.dataVar && variables[el.dataVar]) {
                    src = variables[el.dataVar];
                }
                var imgW = getParsedWidth(el.width);
                var imgH = el.height || 100;
                var angle = el.rotate || 0;

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
                            return { svg: svgString, width: el.width || 100, height: el.height || 100 };
                        } catch (err) {
                            try {
                                var svgString = atob(base64Part);
                                return { svg: svgString, width: el.width || 100, height: el.height || 100 };
                            } catch (err2) {
                                console.error('SVG decode error:', err2);
                            }
                        }
                    } else {
                        var commaIdx = src.indexOf(',');
                        if (commaIdx !== -1) {
                            var rawSvg = decodeURIComponent(src.substring(commaIdx + 1));
                            return { svg: rawSvg, width: el.width || 100, height: el.height || 100 };
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
            var childrenLayout = [];
            children.forEach(function(child) {
                if (!isElementVisible(child, variables)) return;
                var node = elementToNode(child, imagesDict);
                if (node) {
                    var x = child.x || 0;
                    var y = child.y || 0;
                    var w = getElementWidth(child);
                    
                    if (child.type === 'shape') {
                        var rSize = getRotatedSize(child.width || 100, child.height || 50, child.rotate || 0);
                        x = x - rSize.dx;
                        y = y - rSize.dy;
                        w = rSize.w;
                    } else if (child.type === 'image' && child.rotate) {
                        var rSize = getRotatedSize(getParsedWidth(child.width) || 100, child.height || 100, child.rotate || 0);
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
            return {
                stack: [
                    {
                        canvas: [
                            {
                                type: 'rect',
                                x: 0, y: 0,
                                w: getParsedWidth(el.width),
                                h: el.height,
                                color: el.bgColor || 'transparent',
                                lineWidth: (el.showBorder !== false) ? (el.borderWidth || 1) : 0,
                                lineColor: (el.showBorder !== false) ? (el.borderColor || '#cbd5e1') : 'transparent'
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

// ============================================================
// BUILD PDFMAKE DOCUMENT
// ============================================================
function buildLayout(elementsList, baseMarginLeft, baseMarginTop, imagesDict, pageBreakYs) {
    function horizontalOverlap(el1, el2) {
        var w1 = getElementWidth(el1);
        var w2 = getElementWidth(el2);
        var x1 = el1.x;
        var x2 = el2.x;
        var intersection = Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2);
        if (intersection <= 0) return false;
        var minW = Math.min(w1, w2);
        if (isNaN(minW) || minW <= 0) return false;
        return (intersection / minW) > 0.5;
    }
    function verticalOverlap(el1, el2) {
        var h1 = getElementHeight(el1, variables);
        var h2 = getElementHeight(el2, variables);
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
    
    // Filter out pagebreak and hidden elements from the layout calculations
    var layoutElements = elementsList.filter(function(e) {
        return e.type !== 'pagebreak' && isElementVisible(e, variables);
    });
    if (layoutElements.length === 0) return [];

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
                if (Math.abs(el.y - avgY) < 10) { // Y threshold of 10 pixels
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

    // Sort rows by Y coordinate
    rows.sort(function(rowA, rowB) {
        var minY_A = Math.min.apply(null, rowA.map(function(e){ return e.y; }));
        var minY_B = Math.min.apply(null, rowB.map(function(e){ return e.y; }));
        return minY_A - minY_B;
    });

    var prevRowBottom = baseMarginTop;
    var renderedElements = []; // Store { el, absoluteRenderedBottom }

    // Process each row
    rows.forEach(function(row) {
        // Sort elements in this row from left to right (X coordinate)
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

        // Check if we crossed any page break
        var crossedPB = null;
        if (activePBs.length > 0) {
            for (var i = 0; i < activePBs.length; i++) {
                var pbY = activePBs[i];
                if (prevRowBottom <= pbY && pbY <= targetRowTop) {
                    crossedPB = pbY;
                    // Remove all page breaks up to this one
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
            var elHeight = getElementHeight(el, variables);
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
            // Single element in this row
            var el = row[0];
            var node = elementToNode(el, imagesDict);
            if (node) {
                var leftMargin = el.x - baseMarginLeft;
                if (el.type === 'shape') {
                    var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                    leftMargin = el.x - rSize.dx - baseMarginLeft;
                } else if (el.type === 'image' && el.rotate) {
                    var rSize = getRotatedSize(getParsedWidth(el.width) || 100, el.height || 100, el.rotate || 0);
                    leftMargin = el.x - rSize.dx - baseMarginLeft;
                }
                var elW = getElementWidth(el);
                if (el.type === 'shape') {
                    var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                    elW = rSize.w;
                } else if (el.type === 'image' && el.rotate) {
                    var rSize = getRotatedSize(getParsedWidth(el.width) || 100, el.height || 100, el.rotate || 0);
                    elW = rSize.w;
                }
                var maxAllowedW = pageWidth - rightMargin - el.x;
                if (el.type === 'shape') {
                    var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                    maxAllowedW = pageWidth - rightMargin - (el.x - rSize.dx);
                } else if (el.type === 'image' && el.rotate) {
                    var rSize = getRotatedSize(getParsedWidth(el.width) || 100, el.height || 100, el.rotate || 0);
                    maxAllowedW = pageWidth - rightMargin - (el.x - rSize.dx);
                }
                var clampedW = Math.max(10, Math.min(elW, maxAllowedW));
                var colNode = {
                    width: clampedW,
                    stack: [ node ]
                };
                var widthVal = el.width;
                if (widthVal && widthVal.toString().indexOf('%') !== -1) {
                    colNode.width = widthVal.toString().trim();
                }
                if (isRelativeRow) {
                    rowNode = { columns: [ colNode ], relativePosition: { x: leftMargin, y: gapY } };
                } else {
                    rowNode = { columns: [ colNode ], margin: [leftMargin, gapY, 0, 0] };
                }
            }
        } else {
            // Multiple elements on the same row: wrap in columns
            var columns = [];
            var firstEl = row[0];
            var colMarginLeft = firstEl.x - baseMarginLeft;
            var firstRSize = null;
            if (firstEl.type === 'shape') {
                firstRSize = getRotatedSize(firstEl.width || 100, firstEl.height || 50, firstEl.rotate || 0);
                colMarginLeft = firstEl.x - firstRSize.dx - baseMarginLeft;
            } else if (firstEl.type === 'image' && firstEl.rotate) {
                firstRSize = getRotatedSize(getParsedWidth(firstEl.width) || 100, firstEl.height || 100, firstEl.rotate || 0);
                colMarginLeft = firstEl.x - firstRSize.dx - baseMarginLeft;
            }

            var prevEnd = (firstRSize ? (firstEl.x - firstRSize.dx) : firstEl.x);

            row.forEach(function(el, idx) {
                var node = elementToNode(el, imagesDict);
                if (node) {
                    var elW = getElementWidth(el);
                    if (el.type === 'shape') {
                        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                        elW = rSize.w;
                    } else if (el.type === 'image' && el.rotate) {
                        var rSize = getRotatedSize(getParsedWidth(el.width) || 100, el.height || 100, el.rotate || 0);
                        elW = rSize.w;
                    }
                    
                    var maxAllowedW = pageWidth - rightMargin - el.x;
                    if (el.type === 'shape') {
                        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                        maxAllowedW = pageWidth - rightMargin - (el.x - rSize.dx);
                    } else if (el.type === 'image' && el.rotate) {
                        var rSize = getRotatedSize(getParsedWidth(el.width) || 100, el.height || 100, el.rotate || 0);
                        maxAllowedW = pageWidth - rightMargin - (el.x - rSize.dx);
                    }
                    var clampedW = Math.max(10, Math.min(elW, maxAllowedW));

                    var currentStart = el.x;
                    if (el.type === 'shape') {
                        var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                        currentStart = el.x - rSize.dx;
                    } else if (el.type === 'image' && el.rotate) {
                        var rSize = getRotatedSize(getParsedWidth(el.width) || 100, el.height || 100, el.rotate || 0);
                        currentStart = el.x - rSize.dx;
                    }
                    var gap = currentStart - prevEnd;
                    if (gap > 0) {
                        columns.push({ width: gap, text: '' });
                    }

                    var elOffsetY = el.y - currentRowTop;
                    if (elOffsetY > 0) {
                        node.margin = [0, elOffsetY, 0, 0];
                    }

                    var colNode = {
                        width: clampedW,
                        stack: [ node ]
                    };
                    
                    var widthVal = el.width;
                    if (widthVal && widthVal.toString().indexOf('%') !== -1) {
                        colNode.width = widthVal.toString().trim();
                    }
                    
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

function buildDoc() {
    registerFonts();
    var imagesDict = {};
    
    // Sort all pagebreaks by Y coordinate
    var pageBreaks = elements.filter(function(e) { return e.type === 'pagebreak'; }).sort(function(a,b) { return a.y - b.y; });
    var pageBreakYs = pageBreaks.map(function(pb) { return pb.y; });
    
    // Only get top-level elements for the main document flow
    var topLevelElements = elements.filter(function(e) { return !e.parentId; });
    
    var content = buildLayout(topLevelElements, pageConfig.marginLeft, pageConfig.marginTop, imagesDict, pageBreakYs);
    
    var fontName = getPageEffectiveFont();
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

// ============================================================
// ACTIONS
// ============================================================
function previewPDF() {
    document.getElementById('previewModal').classList.add('show');
    pdfMake.createPdf(buildDoc()).getDataUrl(function(url) {
        document.getElementById('previewFrame').src = url;
    });
}
function closePreview() { document.getElementById('previewModal').classList.remove('show'); }
function downloadPDF() { pdfMake.createPdf(buildDoc()).download('report.pdf'); }
function printPDF() { pdfMake.createPdf(buildDoc()).print(); }

function exportJSON() {
    var data = { elements: elements, variables: variables, paper: pageConfig.paperSize, orient: pageConfig.paperOrient, pageConfig: pageConfig };
    var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'template.json';
    a.click();
}

function importJSON() { document.getElementById('fileInput').click(); }
function handleImport(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var data = JSON.parse(ev.target.result);
            elements = data.elements || [];
            variables = data.variables || variables;
            pageConfig = data.pageConfig || {
                bgColor: '#ffffff',
                marginLeft: 20,
                marginTop: 20,
                marginRight: 20,
                marginBottom: 20,
                defaultFont: 'Times New Roman'
            };
            if (data.paper) pageConfig.paperSize = data.paper;
            if (data.orient) pageConfig.paperOrient = data.orient;
            idCounter = elements.reduce(function(m,e){return Math.max(m,e.id);},0);
            selectedId = null;
            selectedIds = [];
            updateAlignToolbar();
            changePaper();
            registerFonts();
            render();
            renderProps();
        } catch(err) { alert('Invalid JSON file: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function viewJSON() {
    var data = { elements: elements, variables: variables, paper: pageConfig.paperSize, orient: pageConfig.paperOrient, pageConfig: pageConfig };
    document.getElementById('jsonTextArea').value = JSON.stringify(data, null, 2);
    document.getElementById('jsonModal').classList.add('show');
}
function closeJSONModal() {
    document.getElementById('jsonModal').classList.remove('show');
}
function copyJSON() {
    var txt = document.getElementById('jsonTextArea').value;
    navigator.clipboard.writeText(txt).then(function() {
        alert('JSON configuration copied to clipboard!');
    }, function() {
        var textarea = document.getElementById('jsonTextArea');
        textarea.select();
        document.execCommand('copy');
        alert('JSON configuration copied to clipboard!');
    });
}
function applyJSON() {
    try {
        var data = JSON.parse(document.getElementById('jsonTextArea').value);
        if (!data.elements) {
            alert('Invalid JSON configuration: Missing "elements" field');
            return;
        }
        elements = data.elements || [];
        variables = data.variables || variables;
        pageConfig = data.pageConfig || {
            bgColor: '#ffffff',
            marginLeft: 20,
            marginTop: 20,
            marginRight: 20,
            marginBottom: 20,
            defaultFont: 'Times New Roman'
        };
        if (data.paper) pageConfig.paperSize = data.paper;
        if (data.orient) pageConfig.paperOrient = data.orient;
        idCounter = elements.reduce(function(m,e){return Math.max(m,e.id);},0);
        selectedId = null;
        selectedIds = [];
        updateAlignToolbar();
        changePaper();
        registerFonts();
        render();
        renderProps();
        closeJSONModal();
        alert('JSON configuration applied successfully!');
    } catch(err) {
        alert('JSON parse error: ' + err.message);
    }
}

var currentFxElId = null;
var currentFxPropName = null;

function openFxEditor(elId, propName) {
    var el = elements.find(function(e) { return e.id === elId; });
    if (!el) return;
    
    currentFxElId = elId;
    currentFxPropName = propName;
    
    var title = '';
    var desc = '';
    var val = '';
    var placeholder = '';
    
    if (propName === 'fxExpr') {
        title = el.type === 'text' ? 'Fx Expression Editor (Text)' : 'Fx Expression Editor (Variable)';
        desc = el.type === 'text'
            ? 'Enter JavaScript expression to calculate this text\'s value. The returned result will be rendered on the document. Variables are accessed via the <code>$data</code> object.'
            : 'Enter JavaScript expression to calculate this variable\'s value. The returned result will be rendered on the document. Variables are accessed via the <code>$data</code> object.';
        val = el.fxExpr || '';
        placeholder = 'e.g., $data.patient_name.toUpperCase() or $data.patient_age >= 18 ? \'Adult\' : \'Minor\'';
    } else if (propName === 'showFx') {
        title = 'Visibility Expression Editor (Fx)';
        desc = 'Enter JavaScript condition to determine if this element should be visible. If it returns <strong>true</strong> (or truthy), the element is shown. If it returns <strong>false</strong> (or falsy), it is excluded from the PDF. Variables are accessed via the <code>$data</code> object.';
        val = el.showFx || '';
        placeholder = 'e.g., $data.medications.length > 0 or $data.clinic_phone !== \'\'';
    } else if (propName === 'colorFx') {
        title = 'Text Color Expression Editor (Fx)';
        desc = 'Enter JavaScript expression returning a color value for this element. The result must be a valid color string (CSS or Hex). Variables are accessed via the <code>$data</code> object.';
        val = el.colorFx || '';
        placeholder = 'e.g., $data.patient_age > 30 ? \'red\' : \'#000000\'';
    }
    
    document.getElementById('fxEditorModalTitle').innerText = title;
    document.getElementById('fxEditorModalDescription').innerHTML = desc;
    var textarea = document.getElementById('fxEditorModalInput');
    textarea.value = val;
    textarea.placeholder = placeholder;
    
    document.getElementById('fxEditorModal').classList.add('show');

    // Trigger highlight update & scroll reset
    textarea.dispatchEvent(new Event('input'));
    var highlightOverlay = document.getElementById('fxEditorHighlight');
    if (highlightOverlay) {
        highlightOverlay.scrollTop = 0;
        highlightOverlay.scrollLeft = 0;
    }
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
}

function closeFxEditorModal() {
    document.getElementById('fxEditorModal').classList.remove('show');
    currentFxElId = null;
    currentFxPropName = null;
}

function saveFxEditorModal() {
    if (currentFxElId === null || currentFxPropName === null) return;
    var el = elements.find(function(e) { return e.id === currentFxElId; });
    if (!el) return;
    
    var val = document.getElementById('fxEditorModalInput').value;
    el[currentFxPropName] = val;
    
    render();
    renderProps();
    closeFxEditorModal();
}

// --- Columns Editor (Headers + Field Mappings combined) ---
var fieldMappingElId = null;

function parseFieldMappings(el) {
    var raw = el.fieldMappings || '';
    if (!raw) return el.headers.map(function() { return ''; });
    // Use || separator if present (Fx mode), otherwise comma
    var sep = raw.indexOf('||') !== -1 ? '||' : ',';
    var parts = raw.split(sep).map(function(s) { return s.trim(); });
    while (parts.length < el.headers.length) parts.push('');
    return parts;
}

function getColumnsSummary(el) {
    var mappings = parseFieldMappings(el);
    var parts = [];
    for (var i = 0; i < el.headers.length; i++) {
        var h = el.headers[i] || ('Col ' + (i+1));
        var m = mappings[i] || '';
        if (m.indexOf('fx:') === 0) {
            parts.push(h + '→{Fx}');
        } else if (m) {
            parts.push(h + '→' + m);
        } else {
            parts.push(h);
        }
    }
    return parts.join(', ') || 'Click to configure...';
}

function getVarDataKeys(el) {
    if (!el.dataVar || !variables[el.dataVar] || !Array.isArray(variables[el.dataVar])) return [];
    var arr = variables[el.dataVar];
    if (arr.length === 0) return [];
    var firstItem = arr[0];
    if (typeof firstItem !== 'object' || firstItem === null) return [];
    return Object.keys(firstItem);
}

function buildColumnRow(idx, headerName, mapping, keys, w, hAlign, bAlign, bg, color, hBold) {
    var isFx = mapping.indexOf('fx:') === 0;
    var fxVal = isFx ? mapping.substring(3) : '';
    var fieldVal = isFx ? '' : mapping;

    w = w || '*';
    hAlign = hAlign || 'center';
    bAlign = bAlign || 'left';
    bg = bg || '';
    color = color || '';
    hBold = hBold !== undefined ? hBold : true;

    var row = document.createElement('div');
    row.className = 'col-editor-row';
    row.style.cssText = 'background:#1e1e2e; border:1px solid #313244; border-radius:6px; padding:8px 10px;';
    row.setAttribute('data-col-idx', idx);

    // Top bar: index label + delete button
    var topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;';
    var idxLabel = document.createElement('span');
    idxLabel.style.cssText = 'font-size:10px; color:#6c7086; font-weight:600;';
    idxLabel.textContent = 'COLUMN ' + (idx + 1);
    topBar.appendChild(idxLabel);
    var delBtn = document.createElement('button');
    delBtn.style.cssText = 'width:auto; margin:0; padding:2px 6px; background:transparent; color:#f38ba8; border:1px solid #45475a; border-radius:4px; cursor:pointer; font-size:10px;';
    delBtn.textContent = '✕';
    delBtn.title = 'Remove column';
    delBtn.onclick = function() { removeColumnRow(row); };
    topBar.appendChild(delBtn);
    row.appendChild(topBar);

    // Main content: header input (left) + field/fx (right)
    var mainRow = document.createElement('div');
    mainRow.style.cssText = 'display:flex; align-items:flex-start; gap:8px;';

    // Left: header name
    var leftCol = document.createElement('div');
    leftCol.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:2px;';
    var headerLbl = document.createElement('span');
    headerLbl.style.cssText = 'font-size:10px; color:#6c7086;';
    headerLbl.textContent = 'Header';
    leftCol.appendChild(headerLbl);
    var headerInput = document.createElement('input');
    headerInput.className = 'col-header-input';
    headerInput.style.cssText = 'width:100%; padding:4px 6px; background:#11111b; color:#cdd6f4; border:1px solid #45475a; border-radius:4px; font-size:12px; box-sizing:border-box;';
    headerInput.value = headerName;
    headerInput.placeholder = 'Header name';
    leftCol.appendChild(headerInput);
    mainRow.appendChild(leftCol);

    // Right: field select / fx + toggle
    var rightCol = document.createElement('div');
    rightCol.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:2px;';
    var mappingLbl = document.createElement('span');
    mappingLbl.style.cssText = 'font-size:10px; color:#6c7086;';
    mappingLbl.textContent = 'Data mapping';
    rightCol.appendChild(mappingLbl);

    var controlRow = document.createElement('div');
    controlRow.style.cssText = 'display:flex; align-items:center; gap:4px;';

    var sel = document.createElement('select');
    sel.className = 'fm-field-select';
    sel.style.cssText = 'flex:1; padding:4px 6px; background:#11111b; color:#cdd6f4; border:1px solid #45475a; border-radius:4px; font-size:12px;';
    sel.innerHTML = '<option value="">(auto)</option>';
    keys.forEach(function(k) {
        sel.innerHTML += '<option value="' + k + '" ' + (fieldVal === k ? 'selected' : '') + '>' + k + '</option>';
    });
    if (isFx) sel.style.display = 'none';
    controlRow.appendChild(sel);

    var fxInput = document.createElement('textarea');
    fxInput.className = 'fm-fx-input';
    fxInput.style.cssText = 'flex:1; padding:4px 6px; background:#11111b; color:#a6e3a1; border:1px solid #45475a; border-radius:4px; font-size:11px; font-family:monospace; height:40px; resize:vertical; display:' + (isFx ? 'block' : 'none') + ';';
    fxInput.placeholder = '$item.field';
    fxInput.value = fxVal;
    controlRow.appendChild(fxInput);

    var fxBtn = document.createElement('button');
    fxBtn.className = 'fm-fx-btn';
    fxBtn.style.cssText = 'width:auto; margin:0; padding:3px 6px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:10px; flex-shrink:0; border:1px solid ' + (isFx ? '#89b4fa' : '#45475a') + '; background:' + (isFx ? '#89b4fa' : '#313244') + '; color:' + (isFx ? '#1e1e2e' : '#cdd6f4') + ';';
    fxBtn.textContent = '{Fx}';
    fxBtn.title = 'Toggle Fx expression';
    fxBtn.onclick = function() {
        var isActive = fxInput.style.display !== 'none';
        if (isActive) {
            fxInput.style.display = 'none';
            sel.style.display = '';
            fxBtn.style.background = '#313244';
            fxBtn.style.color = '#cdd6f4';
            fxBtn.style.borderColor = '#45475a';
        } else {
            fxInput.style.display = 'block';
            sel.style.display = 'none';
            fxBtn.style.background = '#89b4fa';
            fxBtn.style.color = '#1e1e2e';
            fxBtn.style.borderColor = '#89b4fa';
        }
    };
    controlRow.appendChild(fxBtn);

    rightCol.appendChild(controlRow);
    mainRow.appendChild(rightCol);
    row.appendChild(mainRow);

    // Styling row: Width, Header Bold, Header Align, Body Align, Background Color, Text Color
    var stylingRow = document.createElement('div');
    stylingRow.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:8px; border-top:1px solid #313244; padding-top:8px;';

    // Width
    var wDiv = document.createElement('div');
    wDiv.style.cssText = 'display:flex; flex-direction:column; gap:2px; width:65px;';
    var wLbl = document.createElement('span');
    wLbl.style.cssText = 'font-size:9px; color:#6c7086;';
    wLbl.textContent = 'Width';
    wDiv.appendChild(wLbl);
    var wInput = document.createElement('input');
    wInput.className = 'col-width-input';
    wInput.style.cssText = 'width:100%; padding:3px 5px; background:#11111b; color:#cdd6f4; border:1px solid #45475a; border-radius:4px; font-size:11px; box-sizing:border-box;';
    wInput.value = w;
    wInput.placeholder = '*';
    wDiv.appendChild(wInput);
    stylingRow.appendChild(wDiv);

    // Header Bold
    var hbDiv = document.createElement('div');
    hbDiv.style.cssText = 'display:flex; flex-direction:column; gap:4px; align-items:center;';
    var hbLbl = document.createElement('span');
    hbLbl.style.cssText = 'font-size:9px; color:#6c7086;';
    hbLbl.textContent = 'H.Bold';
    hbDiv.appendChild(hbLbl);
    var hbCheck = document.createElement('input');
    hbCheck.type = 'checkbox';
    hbCheck.className = 'col-hbold-checkbox';
    hbCheck.checked = !!hBold;
    hbCheck.style.cssText = 'margin:0; width:14px; height:14px;';
    hbDiv.appendChild(hbCheck);
    stylingRow.appendChild(hbDiv);

    // Header Align
    var haDiv = document.createElement('div');
    haDiv.style.cssText = 'display:flex; flex-direction:column; gap:2px; width:75px;';
    var haLbl = document.createElement('span');
    haLbl.style.cssText = 'font-size:9px; color:#6c7086;';
    haLbl.textContent = 'H.Align';
    haDiv.appendChild(haLbl);
    var haSel = document.createElement('select');
    haSel.className = 'col-halign-select';
    haSel.style.cssText = 'width:100%; padding:3px 5px; background:#11111b; color:#cdd6f4; border:1px solid #45475a; border-radius:4px; font-size:11px;';
    haSel.innerHTML = '<option value="left" '+(hAlign==='left'?'selected':'')+'>left</option>' +
                       '<option value="center" '+(hAlign==='center'?'selected':'')+'>center</option>' +
                       '<option value="right" '+(hAlign==='right'?'selected':'')+'>right</option>';
    haDiv.appendChild(haSel);
    stylingRow.appendChild(haDiv);

    // Body Align
    var baDiv = document.createElement('div');
    baDiv.style.cssText = 'display:flex; flex-direction:column; gap:2px; width:75px;';
    var baLbl = document.createElement('span');
    baLbl.style.cssText = 'font-size:9px; color:#6c7086;';
    baLbl.textContent = 'B.Align';
    baDiv.appendChild(baLbl);
    var baSel = document.createElement('select');
    baSel.className = 'col-balign-select';
    baSel.style.cssText = 'width:100%; padding:3px 5px; background:#11111b; color:#cdd6f4; border:1px solid #45475a; border-radius:4px; font-size:11px;';
    baSel.innerHTML = '<option value="left" '+(bAlign==='left'?'selected':'')+'>left</option>' +
                       '<option value="center" '+(bAlign==='center'?'selected':'')+'>center</option>' +
                       '<option value="right" '+(bAlign==='right'?'selected':'')+'>right</option>';
    baDiv.appendChild(baSel);
    stylingRow.appendChild(baDiv);

    // Background Color (Bg)
    var bgDiv = document.createElement('div');
    bgDiv.style.cssText = 'display:flex; flex-direction:column; gap:2px;';
    var bgLbl = document.createElement('span');
    bgLbl.style.cssText = 'font-size:9px; color:#6c7086;';
    bgLbl.textContent = 'Bg Color';
    bgDiv.appendChild(bgLbl);
    var bgWrapper = document.createElement('div');
    bgWrapper.style.cssText = 'display:flex; align-items:center; gap:2px;';
    var bgTxt = document.createElement('input');
    bgTxt.type = 'text';
    bgTxt.className = 'col-bg-text-input';
    bgTxt.placeholder = 'none';
    bgTxt.value = bg;
    bgTxt.style.cssText = 'width:52px; padding:3px 4px; background:#11111b; color:#cdd6f4; border:1px solid #45475a; border-radius:4px; font-size:10px; box-sizing:border-box;';
    bgWrapper.appendChild(bgTxt);
    var bgColorInput = document.createElement('input');
    bgColorInput.type = 'color';
    bgColorInput.value = (bg && bg.startsWith('#')) ? bg : '#ffffff';
    bgColorInput.style.cssText = 'width:20px; height:18px; padding:0; border:none; background:transparent; cursor:pointer; flex-shrink:0;';
    bgColorInput.oninput = function() {
        bgTxt.value = this.value;
    };
    bgWrapper.appendChild(bgColorInput);
    bgDiv.appendChild(bgWrapper);
    stylingRow.appendChild(bgDiv);

    // Text Color
    var tcDiv = document.createElement('div');
    tcDiv.style.cssText = 'display:flex; flex-direction:column; gap:2px;';
    var tcLbl = document.createElement('span');
    tcLbl.style.cssText = 'font-size:9px; color:#6c7086;';
    tcLbl.textContent = 'Text Color';
    tcDiv.appendChild(tcLbl);
    var tcWrapper = document.createElement('div');
    tcWrapper.style.cssText = 'display:flex; align-items:center; gap:2px;';
    var tcTxt = document.createElement('input');
    tcTxt.type = 'text';
    tcTxt.className = 'col-tc-text-input';
    tcTxt.placeholder = 'none';
    tcTxt.value = color;
    tcTxt.style.cssText = 'width:52px; padding:3px 4px; background:#11111b; color:#cdd6f4; border:1px solid #45475a; border-radius:4px; font-size:10px; box-sizing:border-box;';
    tcWrapper.appendChild(tcTxt);
    var tcColorInput = document.createElement('input');
    tcColorInput.type = 'color';
    tcColorInput.value = (color && color.startsWith('#')) ? color : '#000000';
    tcColorInput.style.cssText = 'width:20px; height:18px; padding:0; border:none; background:transparent; cursor:pointer; flex-shrink:0;';
    tcColorInput.oninput = function() {
        tcTxt.value = this.value;
    };
    tcWrapper.appendChild(tcColorInput);
    tcDiv.appendChild(tcWrapper);
    stylingRow.appendChild(tcDiv);

    row.appendChild(stylingRow);
    return row;
}

function openColumnsEditor(elId) {
    var el = elements.find(function(e) { return e.id === elId; });
    if (!el || el.type !== 'table') return;
    fieldMappingElId = elId;

    var mappings = parseFieldMappings(el);
    var keys = getVarDataKeys(el);
    var container = document.getElementById('fieldMappingRows');
    container.innerHTML = '';
    // Store keys on container for addColumnRow
    container._varKeys = keys;

    // Parse comma-separated properties from el
    var colFills = (el.colFills || '').split(',').map(function(f){return f.trim();});
    var colColors = (el.colColors || '').split(',').map(function(c){return c.trim();});
    var headerAligns = (el.headerAligns || '').split(',').map(function(a){return a.trim();});
    var bodyAligns = (el.bodyAligns || '').split(',').map(function(a){return a.trim();});
    var widths = (el.widths || '').split(',').map(function(w){return w.trim();});
    
    // For header bolds, it can be a comma-separated list or fallback to el.headerBold
    var headerBolds = [];
    if (el.headerBolds) {
        headerBolds = el.headerBolds.split(',').map(function(b){return b.trim() === 'true';});
    } else {
        // Fallback to global headerBold
        var hB = el.headerBold !== false;
        for (var i = 0; i < el.headers.length; i++) {
            headerBolds.push(hB);
        }
    }

    el.headers.forEach(function(header, idx) {
        var m = mappings[idx] || '';
        var bg = colFills[idx] || '';
        var color = colColors[idx] || '';
        var hAlign = headerAligns[idx] || 'center';
        var bAlign = bodyAligns[idx] || 'left';
        var w = widths[idx] || '*';
        var hBold = headerBolds[idx] !== undefined ? headerBolds[idx] : (el.headerBold !== false);
        
        container.appendChild(buildColumnRow(idx, header, m, keys, w, hAlign, bAlign, bg, color, hBold));
    });

    document.getElementById('fieldMappingModal').classList.add('show');
}

// Alias for backward compat
var openFieldMappingEditor = openColumnsEditor;

function addColumnRow() {
    var container = document.getElementById('fieldMappingRows');
    var keys = container._varKeys || [];
    var count = container.querySelectorAll('.col-editor-row').length;
    container.appendChild(buildColumnRow(count, 'Column ' + (count + 1), '', keys, '*', 'center', 'left', '', '', true));
    // Re-index labels
    reindexColumnRows();
}

function removeColumnRow(rowEl) {
    var container = document.getElementById('fieldMappingRows');
    if (container.querySelectorAll('.col-editor-row').length <= 1) return; // keep at least 1
    rowEl.remove();
    reindexColumnRows();
}

function reindexColumnRows() {
    var rows = document.querySelectorAll('#fieldMappingRows .col-editor-row');
    rows.forEach(function(row, i) {
        row.setAttribute('data-col-idx', i);
        var lbl = row.querySelector('span');
        if (lbl) lbl.textContent = 'COLUMN ' + (i + 1);
    });
}

function closeFieldMappingModal() {
    document.getElementById('fieldMappingModal').classList.remove('show');
    fieldMappingElId = null;
}

function saveFieldMappingModal() {
    if (fieldMappingElId === null) return;
    var el = elements.find(function(e) { return e.id === fieldMappingElId; });
    if (!el) return;

    saveUndo();

    var rows = document.querySelectorAll('#fieldMappingRows .col-editor-row');
    var headers = [];
    var mappings = [];
    var widths = [];
    var headerAligns = [];
    var bodyAligns = [];
    var colFills = [];
    var colColors = [];
    var headerBolds = [];

    rows.forEach(function(row) {
        var headerInput = row.querySelector('.col-header-input');
        var sel = row.querySelector('.fm-field-select');
        var fxInput = row.querySelector('.fm-fx-input');
        var isFxMode = fxInput.style.display !== 'none';

        headers.push(headerInput.value || ('Column ' + (headers.length + 1)));

        if (isFxMode && fxInput.value.trim()) {
            mappings.push('fx:' + fxInput.value.trim());
        } else if (!isFxMode && sel.value) {
            mappings.push(sel.value);
        } else {
            mappings.push('');
        }

        // Read stylingRow inputs
        var wInput = row.querySelector('.col-width-input');
        widths.push(wInput ? (wInput.value.trim() || '*') : '*');

        var hbCheck = row.querySelector('.col-hbold-checkbox');
        headerBolds.push(hbCheck ? (hbCheck.checked ? 'true' : 'false') : 'true');

        var haSel = row.querySelector('.col-halign-select');
        headerAligns.push(haSel ? haSel.value : 'center');

        var baSel = row.querySelector('.col-balign-select');
        bodyAligns.push(baSel ? baSel.value : 'left');

        var bgTxt = row.querySelector('.col-bg-text-input');
        colFills.push(bgTxt ? bgTxt.value.trim() : '');

        var tcTxt = row.querySelector('.col-tc-text-input');
        colColors.push(tcTxt ? tcTxt.value.trim() : '');
    });

    el.headers = headers;
    el.cols = headers.length;
    // Use || separator if any fx: mapping to avoid comma conflicts in expressions
    var hasFx = mappings.some(function(m) { return m.indexOf('fx:') === 0; });
    el.fieldMappings = mappings.join(hasFx ? '||' : ',');

    // Save as comma-separated strings
    el.widths = widths.join(',');
    el.headerAligns = headerAligns.join(',');
    el.bodyAligns = bodyAligns.join(',');
    el.colFills = colFills.join(',');
    el.colColors = colColors.join(',');
    el.headerBolds = headerBolds.join(',');

    render();
    renderProps();
    closeFieldMappingModal();
}

function resolveFieldValue(mapping, item, index) {
    if (!mapping || mapping === '') return undefined; // auto
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
    return item[mapping] !== undefined ? item[mapping] : '';
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

function toggleUseTextFx(id, checked) {
    var el = elements.find(function(e) { return e.id === id; });
    if (!el) return;
    el.isFx = checked;
    render();
    renderProps();
    if (checked && !el.fxExpr) {
        openFxEditor(id, 'fxExpr');
    }
}

function toggleUseVarFx(id, checked) {
    var el = elements.find(function(e) { return e.id === id; });
    if (!el) return;
    el.isFx = checked;
    render();
    renderProps();
    if (checked && !el.fxExpr) {
        openFxEditor(id, 'fxExpr');
    }
}

function toggleUseShowFx(id, checked) {
    var el = elements.find(function(e) { return e.id === id; });
    if (!el) return;
    el.useShowFx = checked;
    render();
    renderProps();
    if (checked && !el.showFx) {
        openFxEditor(id, 'showFx');
    }
}

function toggleUseColorFx(id, checked) {
    var el = elements.find(function(e) { return e.id === id; });
    if (!el) return;
    el.isColorFx = checked;
    render();
    renderProps();
    if (checked && !el.colorFx) {
        openFxEditor(id, 'colorFx');
    }
}

function updateAlignToolbar() {
    var toolbar = document.getElementById('alignToolbar');
    if (toolbar) {
        if (selectedIds.length > 1) {
            toolbar.style.display = 'flex';
        } else {
            toolbar.style.display = 'none';
        }
    }
}

function alignSelected(direction) {
    if (selectedIds.length <= 1) return;
    
    var selectedElements = elements.filter(function(e) {
        return selectedIds.indexOf(e.id) !== -1;
    });
    
    if (selectedElements.length === 0) return;
    
    if (direction === 'left') {
        var minX = Math.min.apply(null, selectedElements.map(function(e) { return e.x; }));
        selectedElements.forEach(function(e) {
            e.x = minX;
        });
    } else if (direction === 'right') {
        var maxRight = Math.max.apply(null, selectedElements.map(function(e) {
            return e.x + getElementWidth(e);
        }));
        selectedElements.forEach(function(e) {
            e.x = maxRight - getElementWidth(e);
        });
    } else if (direction === 'center') {
        var minX = Math.min.apply(null, selectedElements.map(function(e) { return e.x; }));
        var maxRight = Math.max.apply(null, selectedElements.map(function(e) {
            return e.x + getElementWidth(e);
        }));
        var midX = minX + (maxRight - minX) / 2;
        selectedElements.forEach(function(e) {
            e.x = Math.round(midX - getElementWidth(e) / 2);
        });
    } else if (direction === 'top') {
        var minY = Math.min.apply(null, selectedElements.map(function(e) { return e.y; }));
        selectedElements.forEach(function(e) {
            e.y = minY;
        });
    } else if (direction === 'bottom') {
        var maxBottom = Math.max.apply(null, selectedElements.map(function(e) {
            return e.y + getElementHeight(e);
        }));
        selectedElements.forEach(function(e) {
            e.y = maxBottom - getElementHeight(e);
        });
    } else if (direction === 'middle') {
        var minY = Math.min.apply(null, selectedElements.map(function(e) { return e.y; }));
        var maxBottom = Math.max.apply(null, selectedElements.map(function(e) {
            return e.y + getElementHeight(e);
        }));
        var midY = minY + (maxBottom - minY) / 2;
        selectedElements.forEach(function(e) {
            e.y = Math.round(midY - getElementHeight(e) / 2);
        });
    } else if (direction === 'distributeH') {
        if (selectedElements.length < 3) return;
        var sorted = selectedElements.slice().sort(function(a, b) { return a.x - b.x; });
        var span = sorted[sorted.length - 1].x - sorted[0].x;
        var step = span / (sorted.length - 1);
        sorted.forEach(function(e, i) {
            e.x = Math.round(sorted[0].x + i * step);
        });
    } else if (direction === 'distributeV') {
        if (selectedElements.length < 3) return;
        var sorted = selectedElements.slice().sort(function(a, b) { return a.y - b.y; });
        var span = sorted[sorted.length - 1].y - sorted[0].y;
        var step = span / (sorted.length - 1);
        sorted.forEach(function(e, i) {
            e.y = Math.round(sorted[0].y + i * step);
        });
    }
    
    render();
    renderProps();
}

function changePaper() {
    var paper = document.getElementById('paper');
    var sizes = { LETTER:[612,792], A4:[595,842], A5:[420,595], LEGAL:[612,1008] };
    var s = sizes[pageConfig.paperSize || 'LETTER'] || sizes.LETTER;
    var orient = pageConfig.paperOrient || 'portrait';
    paper.style.width = (orient==='landscape'?s[1]:s[0]) + 'px';
    paper.style.minHeight = (orient==='landscape'?s[0]:s[1]) + 'px';
    render();
}

// ESC close modals & Arrow keys move elements
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closePreview();
        closeVarModal();
        closeJSONModal();
        closeFxEditorModal();
        return;
    }

    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        var activeTag = document.activeElement.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        e.preventDefault();
        undo();
        return;
    }

    // Copy: Ctrl+C
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        var activeTag = document.activeElement.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        if (selectedIds.length > 0) {
            clipboard = elements.filter(function(el) {
                return selectedIds.indexOf(el.id) !== -1;
            }).map(function(el) { return JSON.parse(JSON.stringify(el)); });
            e.preventDefault();
        }
        return;
    }

    // Paste: Ctrl+V
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        var activeTag = document.activeElement.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        if (clipboard.length > 0) {
            e.preventDefault();
            saveUndo();
            var idMap = {};
            var newIds = [];
            clipboard.forEach(function(src) {
                var newEl = JSON.parse(JSON.stringify(src));
                var newId = ++idCounter;
                idMap[src.id] = newId;
                newEl.id = newId;
                newEl.x += 15;
                newEl.y += 15;
                newIds.push(newId);
                elements.push(newEl);
            });
            // Fix parentId references for pasted panels
            elements.forEach(function(el) {
                if (newIds.indexOf(el.id) !== -1 && el.parentId && idMap[el.parentId]) {
                    el.parentId = idMap[el.parentId];
                }
            });
            selectedIds = newIds;
            selectedId = newIds[0];
            updateAlignToolbar();
            render();
            renderProps();
            renderOutline();
        }
        return;
    }
    
    // Check if elements are selected and user is not typing in inputs
    if (selectedIds.length > 0) {
        var activeTag = document.activeElement.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
            return;
        }
        
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            saveUndo();
            var idsToRemove = selectedIds.slice();
            var allRemoveIds = {};
            idsToRemove.forEach(function(id) {
                allRemoveIds[id] = true;
            });
            // Include nested children of deleted panels
            elements.forEach(function(el) {
                if (el.parentId && allRemoveIds[el.parentId]) {
                    allRemoveIds[el.id] = true;
                }
            });
            elements = elements.filter(function(el) {
                return !allRemoveIds[el.id];
            });
            selectedIds = [];
            selectedId = null;
            updateAlignToolbar();
            render();
            renderProps();
            return;
        }
        
        var selectedElements = elements.filter(function(item) {
            return selectedIds.indexOf(item.id) !== -1;
        });
        
        if (selectedElements.length === 0) return;
        
        var moved = false;
        var undoSavedForArrow = false;
        var step = e.shiftKey ? 10 : 1;
        
        if (e.key === 'ArrowUp') {
            selectedElements.forEach(function(el) {
                if (el.parentId && selectedIds.indexOf(el.parentId) !== -1) return;
                el.y = Math.max(0, el.y - step);
            });
            moved = true;
        } else if (e.key === 'ArrowDown') {
            selectedElements.forEach(function(el) {
                if (el.parentId && selectedIds.indexOf(el.parentId) !== -1) return;
                el.y = el.y + step;
            });
            moved = true;
        } else if (e.key === 'ArrowLeft') {
            selectedElements.forEach(function(el) {
                if (el.parentId && selectedIds.indexOf(el.parentId) !== -1) return;
                if (el.type !== 'pagebreak') {
                    el.x = Math.max(0, el.x - step);
                }
            });
            moved = true;
        } else if (e.key === 'ArrowRight') {
            selectedElements.forEach(function(el) {
                if (el.parentId && selectedIds.indexOf(el.parentId) !== -1) return;
                if (el.type !== 'pagebreak') {
                    el.x = el.x + step;
                }
            });
            moved = true;
        }
        
        if (moved) {
            if (!undoSavedForArrow) { saveUndo(); undoSavedForArrow = true; }
            e.preventDefault();
            render();
            renderProps();
        }
    }
});

function toggleIframePointerEvents(enable) {
    var iframes = document.querySelectorAll('iframe');
    iframes.forEach(function(iframe) {
        if (!enable) {
            iframe.style.pointerEvents = 'none';
        } else {
            var activeFrameId = 'livePreviewFrame' + currentActiveFrame;
            if (iframe.id === activeFrameId) {
                iframe.style.pointerEvents = 'auto';
            } else {
                iframe.style.pointerEvents = 'none';
            }
        }
    });
}

// Sidebar Resizer Drag Logic
(function() {
    var resizer = document.getElementById('sidebarResizer');
    var app = document.querySelector('.app');
    var isResizing = false;

    resizer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        isResizing = true;
        resizer.classList.add('active');
        toggleIframePointerEvents(false);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    function handleMouseMove(e) {
        if (!isResizing) return;
        var sidebarWidth = window.innerWidth - e.clientX - 3;
        sidebarWidth = Math.max(180, Math.min(500, sidebarWidth));
        app.style.gridTemplateColumns = '200px 1fr 6px ' + sidebarWidth + 'px';
    }

    function handleMouseUp() {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            toggleIframePointerEvents(true);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
    }
})();

// Live Preview Functions
function toggleLivePreview() {
    var btn = document.getElementById('livePreviewBtn');
    var resizer = document.getElementById('previewResizer');
    var previewPane = document.querySelector('.preview-pane');
    var canvasPane = document.querySelector('.canvas-pane');
    
    isLivePreviewOn = !isLivePreviewOn;
    
    if (isLivePreviewOn) {
        btn.classList.add('primary');
        resizer.style.display = 'block';
        previewPane.style.display = 'flex';
        if (!canvasPane.style.width) {
            canvasPane.style.flex = '1';
        }
        updateLivePreview();
    } else {
        btn.classList.remove('primary');
        resizer.style.display = 'none';
        previewPane.style.display = 'none';
        canvasPane.style.width = '';
        canvasPane.style.flex = '1';
        
        // Reset frame sources and revoke blob URL
        document.getElementById('livePreviewFrame1').src = 'about:blank';
        document.getElementById('livePreviewFrame2').src = 'about:blank';
        if (activeBlobUrl) {
            URL.revokeObjectURL(activeBlobUrl);
            activeBlobUrl = null;
        }
    }
}

function triggerLivePreviewUpdate() {
    if (!isLivePreviewOn) return;
    
    var autoUpdateCheckbox = document.getElementById('livePreviewAutoUpdate');
    var isAutoUpdate = autoUpdateCheckbox ? autoUpdateCheckbox.checked : true;
    if (!isAutoUpdate) return;
    
    if (livePreviewTimeout) {
        clearTimeout(livePreviewTimeout);
    }
    livePreviewTimeout = setTimeout(function() {
        updateLivePreview();
    }, 450);
}

function updateLivePreview(force) {
    if (!isLivePreviewOn) return;
    
    if (!force) {
        var autoUpdateCheckbox = document.getElementById('livePreviewAutoUpdate');
        var isAutoUpdate = autoUpdateCheckbox ? autoUpdateCheckbox.checked : true;
        if (!isAutoUpdate) return;
    }
    
    var nextFrameNum = currentActiveFrame === 1 ? 2 : 1;
    var activeFrame = document.getElementById('livePreviewFrame' + currentActiveFrame);
    var nextFrame = document.getElementById('livePreviewFrame' + nextFrameNum);
    if (!activeFrame || !nextFrame) return;
    
    pdfMake.createPdf(buildDoc()).getBlob(function(blob) {
        var newUrl = URL.createObjectURL(blob);
        var loaded = false;
        
        function onFrameLoad() {
            if (loaded) return;
            loaded = true;
            nextFrame.removeEventListener('load', onFrameLoad);
            
            // Swap frames using opacity and z-index transitions
            nextFrame.style.opacity = '1';
            var isDragging = !!document.querySelector('.pane-resizer.active, .resizer.active, .outline-resizer.active');
            nextFrame.style.pointerEvents = isDragging ? 'none' : 'auto';
            nextFrame.style.zIndex = '2';
            
            activeFrame.style.opacity = '0';
            activeFrame.style.pointerEvents = 'none';
            activeFrame.style.zIndex = '1';
            
            // Clean up previous blob URL to avoid memory leaks
            if (activeBlobUrl) {
                URL.revokeObjectURL(activeBlobUrl);
            }
            activeBlobUrl = newUrl;
            currentActiveFrame = nextFrameNum;
        }
        
        nextFrame.addEventListener('load', onFrameLoad);
        nextFrame.src = newUrl;
        
        // Fallback safety timeout (forces swap if load event is suppressed by the browser's PDF engine)
        setTimeout(function() {
            if (!loaded) {
                onFrameLoad();
            }
        }, 150);
    });
}

// Live Preview Resizer Drag Logic
(function() {
    var resizer = document.getElementById('previewResizer');
    var canvasPane = document.querySelector('.canvas-pane');
    var isResizing = false;
    var startX, startWidth;

    resizer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        isResizing = true;
        resizer.classList.add('active');
        toggleIframePointerEvents(false);
        startX = e.clientX;
        startWidth = canvasPane.offsetWidth;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    function handleMouseMove(e) {
        if (!isResizing) return;
        var deltaX = e.clientX - startX;
        var newWidth = startWidth + deltaX;
        // Clamp widths: canvas pane at least 400px, preview pane at least 300px
        var containerWidth = document.querySelector('.canvas-wrap').offsetWidth;
        newWidth = Math.max(400, Math.min(containerWidth - 306, newWidth));
        canvasPane.style.flex = 'none';
        canvasPane.style.width = newWidth + 'px';
    }

    function handleMouseUp() {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            toggleIframePointerEvents(true);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
    }
})();

// Elements Outline Resizer Drag Logic
(function() {
    var resizer = document.getElementById('outlineResizer');
    var outlineSection = document.getElementById('outlineSection');
    var isResizing = false;
    var startY, startHeight;

    if (!resizer || !outlineSection) return;

    resizer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        isResizing = true;
        resizer.classList.add('active');
        toggleIframePointerEvents(false);
        startY = e.clientY;
        startHeight = outlineSection.offsetHeight;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    function handleMouseMove(e) {
        if (!isResizing) return;
        var deltaY = e.clientY - startY;
        var newHeight = startHeight - deltaY;
        var maxHeight = window.innerHeight - 150;
        newHeight = Math.max(100, Math.min(maxHeight, newHeight));
        outlineSection.style.height = newHeight + 'px';
    }

    function handleMouseUp() {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            toggleIframePointerEvents(true);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
    }
})();

// ============================================================
// CUSTOM FONTS MANAGEMENT
// ============================================================
function registerFonts() {
    if (!pageConfig.customFonts) {
        pageConfig.customFonts = [];
    }
    
    if (typeof pdfMake !== 'undefined') {
        // Reset to standard built-in fonts (keep Roboto)
        pdfMake.fonts = {
            Roboto: {
                normal: 'Roboto-Regular.ttf',
                bold: 'Roboto-Medium.ttf',
                italics: 'Roboto-Italic.ttf',
                bolditalics: 'Roboto-MediumItalic.ttf'
            }
        };
        // Add Times New Roman from window.TimesNewRomanFonts
        if (typeof window !== 'undefined' && window.TimesNewRomanFonts && pdfMake.vfs) {
            pdfMake.vfs['SVN-Times-New-Roman.ttf'] = window.TimesNewRomanFonts.normal;
            pdfMake.vfs['SVN-Times-New-Roman-Bold.ttf'] = window.TimesNewRomanFonts.bold;
            pdfMake.vfs['SVN-Times-New-Roman-Italic.ttf'] = window.TimesNewRomanFonts.italics;
            pdfMake.vfs['SVN-Times-New-Roman-BoldItalic.ttf'] = window.TimesNewRomanFonts.bolditalics;
            
            var timesNewRomanDef = {
                normal: 'SVN-Times-New-Roman.ttf',
                bold: 'SVN-Times-New-Roman-Bold.ttf',
                italics: 'SVN-Times-New-Roman-Italic.ttf',
                bolditalics: 'SVN-Times-New-Roman-BoldItalic.ttf'
            };
            pdfMake.fonts['Times New Roman'] = timesNewRomanDef;
            pdfMake.fonts['TimesNewRoman'] = timesNewRomanDef;
            
            registerFontFaceInBrowser('Times New Roman', 'normal', window.TimesNewRomanFonts.normal);
            registerFontFaceInBrowser('Times New Roman', 'bold', window.TimesNewRomanFonts.bold);
            registerFontFaceInBrowser('Times New Roman', 'italic', window.TimesNewRomanFonts.italics);
            registerFontFaceInBrowser('Times New Roman', 'bold italic', window.TimesNewRomanFonts.bolditalics);
            
            registerFontFaceInBrowser('TimesNewRoman', 'normal', window.TimesNewRomanFonts.normal);
            registerFontFaceInBrowser('TimesNewRoman', 'bold', window.TimesNewRomanFonts.bold);
            registerFontFaceInBrowser('TimesNewRoman', 'italic', window.TimesNewRomanFonts.italics);
            registerFontFaceInBrowser('TimesNewRoman', 'bold italic', window.TimesNewRomanFonts.bolditalics);
        }
        
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
            
            registerFontFaceInBrowser(font.name, 'normal', font.normal);
            if (font.bold) registerFontFaceInBrowser(font.name, 'bold', font.bold);
            if (font.italics) registerFontFaceInBrowser(font.name, 'italic', font.italics);
            if (font.bolditalics) registerFontFaceInBrowser(font.name, 'bold italic', font.bolditalics);
        });
    }
}

var loadedBrowserFonts = {};

function registerFontFaceInBrowser(name, style, base64) {
    if (!base64) return;
    var key = name + '_' + style + '_' + base64.substring(0, 100);
    if (loadedBrowserFonts[key]) return;
    loadedBrowserFonts[key] = true;
    
    var url = base64.indexOf('data:font/') === 0 ? 'url(' + base64 + ')' : 'url(data:font/ttf;base64,' + base64 + ')';
    var weight = 'normal';
    var fontStyle = 'normal';
    if (style.indexOf('bold') !== -1) weight = 'bold';
    if (style.indexOf('italic') !== -1) fontStyle = 'italic';
    
    try {
        var fontFace = new FontFace(name, url, { style: fontStyle, weight: weight });
        fontFace.load().then(function(loadedFace) {
            document.fonts.add(loadedFace);
            if (typeof render === 'function') {
                render();
            }
        }).catch(function(err) {
            console.error('Error loading FontFace: ' + name + ' (' + style + ')', err);
        });
    } catch(e) {
        console.error('FontFace API not supported or error: ', e);
    }
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

function getPageEffectiveFont() {
    var fontName = pageConfig.defaultFont || 'Roboto';
    var effective = getElementEffectiveFont(fontName);
    return effective || 'Roboto';
}

var editingFontIdx = null;

function openEditFontModal(idx) {
    editingFontIdx = idx;
    var font = pageConfig.customFonts[idx];
    document.getElementById('addFontModalTitle').textContent = 'Update Custom Font';
    
    document.getElementById('fontNameInput').value = font.name;
    document.getElementById('fontNameInput').disabled = true;
    
    document.getElementById('fontRegularInput').value = '';
    document.getElementById('fontRegularLabel').textContent = font.normal ? 'Đã tải lên (.ttf)' : 'No file selected';
    
    document.getElementById('fontBoldInput').value = '';
    document.getElementById('fontBoldLabel').textContent = font.bold ? 'Đã tải lên (.ttf)' : 'No file selected (Optional - Cần thiết cho thẻ <b>)';
    
    document.getElementById('fontItalicInput').value = '';
    document.getElementById('fontItalicLabel').textContent = font.italics ? 'Đã tải lên (.ttf)' : 'No file selected (Optional)';
    
    document.getElementById('fontBoldItalicInput').value = '';
    document.getElementById('fontBoldItalicLabel').textContent = font.bolditalics ? 'Đã tải lên (.ttf)' : 'No file selected (Optional)';
    
    document.getElementById('addFontModal').classList.add('show');
}

function openAddFontModal() {
    editingFontIdx = null;
    document.getElementById('addFontModalTitle').textContent = 'Add Custom Font';
    
    document.getElementById('fontNameInput').value = '';
    document.getElementById('fontNameInput').disabled = false;
    
    document.getElementById('fontRegularInput').value = '';
    document.getElementById('fontRegularLabel').textContent = 'No file selected';
    document.getElementById('fontBoldInput').value = '';
    document.getElementById('fontBoldLabel').textContent = 'No file selected (Optional - Cần thiết cho thẻ <b>)';
    document.getElementById('fontItalicInput').value = '';
    document.getElementById('fontItalicLabel').textContent = 'No file selected (Optional)';
    document.getElementById('fontBoldItalicInput').value = '';
    document.getElementById('fontBoldItalicLabel').textContent = 'No file selected (Optional)';
    document.getElementById('addFontModal').classList.add('show');
}

function closeAddFontModal() {
    document.getElementById('addFontModal').classList.remove('show');
}

function updateFontLabel(inputId, labelId) {
    var input = document.getElementById(inputId);
    var label = document.getElementById(labelId);
    if (input.files && input.files[0]) {
        label.textContent = input.files[0].name;
    } else {
        label.textContent = 'No file selected';
    }
}

function saveCustomFont() {
    var name = document.getElementById('fontNameInput').value.trim();
    if (!name) {
        alert('Please enter font name!');
        return;
    }
    name = name.replace(/[^a-zA-Z0-9_\s-]/g, '');
    
    var regInput = document.getElementById('fontRegularInput');
    var isEdit = editingFontIdx !== null;
    
    if (!isEdit && (!regInput.files || !regInput.files[0])) {
        alert('Please select Regular font file (.ttf)!');
        return;
    }

    var promises = [];
    var fontObj = isEdit ? Object.assign({}, pageConfig.customFonts[editingFontIdx]) : { name: name };

    function readFileAsBase64(file, prop) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var base64Part = e.target.result.split(',')[1];
                fontObj[prop] = base64Part;
                resolve();
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    if (regInput.files && regInput.files[0]) {
        promises.push(readFileAsBase64(regInput.files[0], 'normal'));
    }

    var boldInput = document.getElementById('fontBoldInput');
    if (boldInput.files && boldInput.files[0]) {
        promises.push(readFileAsBase64(boldInput.files[0], 'bold'));
    }
    
    var italicInput = document.getElementById('fontItalicInput');
    if (italicInput.files && italicInput.files[0]) {
        promises.push(readFileAsBase64(italicInput.files[0], 'italics'));
    }

    var biInput = document.getElementById('fontBoldItalicInput');
    if (biInput.files && biInput.files[0]) {
        promises.push(readFileAsBase64(biInput.files[0], 'bolditalics'));
    }

    Promise.all(promises).then(function() {
        if (!pageConfig.customFonts) pageConfig.customFonts = [];
        if (isEdit) {
            pageConfig.customFonts[editingFontIdx] = fontObj;
        } else {
            pageConfig.customFonts = pageConfig.customFonts.filter(function(f) { return f.name !== name; });
            pageConfig.customFonts.push(fontObj);
        }
        
        registerFonts();
        closeAddFontModal();
        render();
        renderProps();
        alert('Custom font "' + name + '" saved successfully!');
    }).catch(function(err) {
        console.error(err);
        alert('Error loading font file!');
    });
}

function deleteCustomFont(idx) {
    if (confirm('Are you sure you want to delete this custom font?')) {
        if (pageConfig.customFonts && pageConfig.customFonts[idx]) {
            var name = pageConfig.customFonts[idx].name;
            pageConfig.customFonts.splice(idx, 1);
            
            elements.forEach(function(el) {
                if (el.font === name) {
                    el.font = undefined;
                }
            });
            if (pageConfig.defaultFont === name) {
                pageConfig.defaultFont = 'Roboto';
            }
            
            registerFonts();
            render();
            renderProps();
        }
    }
}

// Init
registerFonts();
render();

// Autocomplete & Syntax Highlighting logic for Fx Editor
(function() {
    var textarea = null;
    var container = null;
    var highlightOverlay = null;
    var activeIndex = -1;
    var currentKeys = [];
    var lastMatch = null;

    function initAutocomplete() {
        textarea = document.getElementById('fxEditorModalInput');
        container = document.getElementById('fxSuggestions');
        highlightOverlay = document.getElementById('fxEditorHighlight');
        if (!textarea || !container || !highlightOverlay) return;

        textarea.addEventListener('input', handleInput);
        textarea.addEventListener('input', handleHighlight);
        textarea.addEventListener('scroll', handleScroll);
        textarea.addEventListener('keydown', handleKeyDown);
        
        // Hide overlay if user clicks outside
        document.addEventListener('click', function(e) {
            if (!container.contains(e.target) && e.target !== textarea) {
                hideSuggestions();
            }
        });
    }

    function handleHighlight() {
        highlightOverlay.innerHTML = highlightSyntax(textarea.value) + "\n";
    }

    function handleScroll() {
        highlightOverlay.scrollTop = textarea.scrollTop;
        highlightOverlay.scrollLeft = textarea.scrollLeft;
    }

    function highlightSyntax(code) {
        var regex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(["'`](?:\\.|[^\\])*?["'`])|(\$data\.[a-zA-Z0-9_]+)|(\b(?:if|else|for|switch|case|default|while|do|return|var|let|const|function|true|false|null|undefined|new|throw|try|catch|finally|typeof|instanceof|in|of)\b)|(\b\d+\b)/g;

        return code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(regex, function(match, comment, string, dataVar, keyword, number) {
                if (comment) {
                    return '<span class="hl-comment">' + comment + '</span>';
                }
                if (string) {
                    return '<span class="hl-string">' + string + '</span>';
                }
                if (dataVar) {
                    return '<span class="hl-var">' + dataVar + '</span>';
                }
                if (keyword) {
                    return '<span class="hl-keyword">' + keyword + '</span>';
                }
                if (number) {
                    return '<span class="hl-number">' + number + '</span>';
                }
                return match;
            });
    }

    function handleInput() {
        var cursor = textarea.selectionStart;
        var valBeforeCursor = textarea.value.substring(0, cursor);
        var match = valBeforeCursor.match(/\$data\.([a-zA-Z0-9_]*)$/);
        
        if (match) {
            lastMatch = match;
            var typed = match[1];
            
            // Get available variables keys
            var allKeys = Object.keys(variables);
            currentKeys = allKeys.filter(function(k) {
                return k.toLowerCase().indexOf(typed.toLowerCase()) !== -1;
            });
            
            if (currentKeys.length > 0) {
                renderSuggestions();
                showSuggestions();
            } else {
                hideSuggestions();
            }
        } else {
            hideSuggestions();
        }
    }

    function renderSuggestions() {
        container.innerHTML = '';
        activeIndex = Math.min(activeIndex, currentKeys.length - 1);
        if (activeIndex < 0 && currentKeys.length > 0) {
            activeIndex = 0;
        }
        
        currentKeys.forEach(function(key, idx) {
            var item = document.createElement('div');
            item.className = 'fx-suggestion-item' + (idx === activeIndex ? ' active' : '');
            
            // Variable label
            var keySpan = document.createElement('span');
            keySpan.textContent = key;
            item.appendChild(keySpan);
            
            // Variable type badge
            var typeSpan = document.createElement('span');
            typeSpan.className = 'var-type';
            var val = variables[key];
            if (Array.isArray(val)) {
                typeSpan.textContent = 'Array';
            } else if (typeof val === 'string' && (val.startsWith('data:image/') || val.startsWith('http://') || val.startsWith('https://'))) {
                typeSpan.textContent = 'Image';
            } else {
                typeSpan.textContent = typeof val;
            }
            item.appendChild(typeSpan);
            
            item.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                selectSuggestion(key);
            });
            
            container.appendChild(item);
        });
    }

    function selectSuggestion(key) {
        if (!lastMatch) return;
        var cursor = textarea.selectionStart;
        var matchLen = lastMatch[0].length;
        var startIdx = cursor - matchLen;
        
        var replacement = '$data.' + key;
        var before = textarea.value.substring(0, startIdx);
        var after = textarea.value.substring(cursor);
        
        textarea.value = before + replacement + after;
        
        // Put cursor at end of replacement
        var newCursorPos = startIdx + replacement.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
        
        handleHighlight();
        hideSuggestions();
    }

    function handleKeyDown(e) {
        if (container.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % currentKeys.length;
            renderSuggestions();
            scrollIntoView();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + currentKeys.length) % currentKeys.length;
            renderSuggestions();
            scrollIntoView();
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < currentKeys.length) {
                e.preventDefault();
                selectSuggestion(currentKeys[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideSuggestions();
        }
    }

    function scrollIntoView() {
        var activeEl = container.querySelector('.fx-suggestion-item.active');
        if (activeEl) {
            activeEl.scrollIntoView({ block: 'nearest' });
        }
    }

    function showSuggestions() {
        container.style.display = 'block';
    }

    function hideSuggestions() {
        container.style.display = 'none';
        activeIndex = -1;
        currentKeys = [];
        lastMatch = null;
    }

    // Call init
    initAutocomplete();
})();

// ============================================================
// IFRAME INTEGRATION (POSTMESSAGE API FOR VUE/REACT)
// ============================================================
window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg || !msg.type) return;

    if (msg.type === 'INIT_EDITOR') {
        if (msg.data && msg.data.template) {
            elements = msg.data.template.elements || [];
            pageConfig = msg.data.template.pageConfig || pageConfig;
        }
        if (msg.data && msg.data.variables) {
            variables = msg.data.variables;
        }
        var maxId = 0;
        elements.forEach(function(el) { if (el.id > maxId) maxId = el.id; });
        idCounter = maxId;
        selectedId = null;
        selectedIds = [];
        updateAlignToolbar();
        changePaper();
        registerFonts();
        render();
        renderProps();
        renderOutline();
    } else if (msg.type === 'GET_JSON') {
        var templateData = {
            elements: elements,
            pageConfig: pageConfig
        };
        window.parent.postMessage({
            type: 'SEND_JSON',
            data: templateData
        }, '*');
    }
});

// Notify parent window that editor is ready
try {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'EDITOR_READY' }, '*');
    }
} catch (e) {
    console.warn('Failed to notify parent window:', e);
}
