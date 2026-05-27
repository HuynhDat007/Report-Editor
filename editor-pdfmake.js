// ============================================================
// STATE
// ============================================================
var elements = [];
var selectedId = null;
var selectedIds = [];
var idCounter = 0;
var pageConfig = {
    bgColor: '#ffffff',
    marginLeft: 20,
    marginTop: 20,
    marginRight: 20,
    marginBottom: 20,
    defaultFont: 'Roboto',
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

// ============================================================
// ELEMENT MANAGEMENT
// ============================================================
function addElement(type) {
    var el = { id: ++idCounter, x: 20, y: 20 + elements.length * 24, parentId: null, showFx: '', useShowFx: false, isColorFx: false, colorFx: '' };
    switch(type) {
        case 'text':
            Object.assign(el, { type:'text', text:'New Text', fontSize:13, bold:false, italic:false, align:'left', color:'#000000', width:200 });
            break;
        case 'heading':
            Object.assign(el, { type:'text', text:'TITLE', fontSize:18, bold:true, italic:false, align:'center', color:'#000000', width:572 });
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
            Object.assign(el, { type:'table', cols:3, rows:2, headers:['Column 1','Column 2','Column 3'], data:[['a','b','c']], widths:'*,*,*', fontSize:12, width:500, borderWidth:1, borderColor:'#000000', showBorder:true, showHeader:true, headerAligns:'center,center,center', bodyAligns:'left,left,left', headerBold:true, bold:false, italic:false, color:'#000000', dataVar:'', fieldMappings:'', colFills:'', oddRowFill:'', evenRowFill:'' });
            break;
        case 'columns':
            Object.assign(el, { type:'columns', left:'Left Content', right:'Right Content', fontSize:13, width:550, leftAlign:'left', rightAlign:'left' });
            break;
        case 'var':
            var key = Object.keys(variables)[0] || 'patient_name';
            Object.assign(el, { type:'var', varName:key, fontSize:13, bold:false, italic:false, align:'left', color:'#000000', prefix:'', width:200, isFx:false, fxExpr:'' });
            break;
        case 'image':
            Object.assign(el, { type:'image', imageSrc:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAADFLCArAAAAA1BMVEUzMzMrj16bAAAAR0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3wA7gAAB6PpYEwAAAABJRU5ErkJggg==', width:100, height:100 });
            break;
        case 'panel':
            Object.assign(el, { type:'panel', width:200, height:150, bgColor:'#f1f5f9', borderColor:'#cbd5e1', borderWidth:1 });
            break;
        case 'pagebreak':
            Object.assign(el, { type:'pagebreak', width:'100%', height:20 });
            el.x = 0;
            break;
    }
    elements.push(el);
    selectElement(el.id);
    render();
}

function deleteElement(id) {
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
    paper.style.fontFamily = pageConfig.defaultFont === 'Times New Roman' ? "'Times New Roman', serif" : "'Roboto', sans-serif";

    var sizes = { LETTER:[612,792], A4:[595,842], A5:[420,595], LEGAL:[612,1008] };
    var s = sizes[pageConfig.paperSize || 'LETTER'] || sizes.LETTER;
    var orient = pageConfig.paperOrient || 'portrait';
    var w = (orient==='landscape'?s[1]:s[0]);
    var h = (orient==='landscape'?s[0]:s[1]);

    function renderElementDOM(el) {
        var div = document.createElement('div');
        var isVisible = isElementVisible(el, variables);
        var isSelected = selectedIds.indexOf(el.id) !== -1;
        div.className = 'el' + (isSelected ? ' selected' : '') + (isVisible ? '' : ' hidden-preview');
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
                div.textContent = el.text;
                break;
            case 'var':
                div.style.fontSize = el.fontSize + 'px';
                div.style.fontWeight = el.bold ? 'bold' : 'normal';
                div.style.fontStyle = el.italic ? 'italic' : 'normal';
                div.style.textAlign = el.align;
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
                    svg += '<rect x="'+(sw/2)+'" y="'+(sw/2)+'" width="'+(swW-sw)+'" height="'+(swH-sw)+'" rx="'+r+'" ry="'+r+'" stroke="'+sc+'" stroke-width="sw" fill="'+fc+'" />';
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
                var img = document.createElement('img');
                var src = el.imageSrc || '';
                if (el.dataVar && variables[el.dataVar]) {
                    src = variables[el.dataVar];
                }
                img.src = src;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.display = 'block';
                
                var wVal = (el.width !== undefined && el.width !== null) ? el.width.toString() : '100';
                div.style.width = getParsedWidth(wVal) + 'px';
                div.style.height = (el.height || 100) + 'px';
                div.innerHTML = '';
                div.appendChild(img);
                break;
            case 'table':
                var bdrStyle = el.showBorder ? (el.borderWidth||1)+'px solid '+(el.borderColor||'#000') : 'none';
                var hBold = el.headerBold ? 'font-weight:bold;' : '';
                var hAligns = (el.headerAligns||'center').split(',').map(function(a){return a.trim();});
                var bAligns = (el.bodyAligns||'left').split(',').map(function(a){return a.trim();});
                var bBold = el.bold ? 'font-weight:bold;' : '';
                var bItalic = el.italic ? 'font-style:italic;' : '';
                var tColor = 'color:'+(el.color||'#000')+';';
                
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
                
                var colFills = (el.colFills || '').split(',').map(function(f){return f.trim();});
                var oddFill = el.oddRowFill || '';
                var evenFill = el.evenRowFill || '';

                var tbl = '<table style="table-layout:fixed;border-collapse:collapse;width:100%;font-size:'+el.fontSize+'px;'+tColor+'">';
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
                        tbl += '<th style="border:'+bdrStyle+';padding:2px 4px;'+hBold+'text-align:'+(hAligns[i]||hAligns[0]||'center')+';'+bgStyle+'">' +h+'</th>';
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
                        tbl += '<td style="border:'+bdrStyle+';padding:2px 4px;text-align:'+(bAligns[i]||bAligns[0]||'left')+';'+bBold+bItalic+bgStyle+'">'+c+'</td>';
                    });
                    tbl += '</tr>';
                });
                tbl += '</table>';
                div.style.width = getElementWidth(el) + 'px';
                div.innerHTML = tbl;
                break;
            case 'panel':
                div.style.width = el.width + 'px';
                div.style.height = el.height + 'px';
                div.style.background = (el.bgColor && el.bgColor !== 'transparent') ? el.bgColor : 'rgba(0,0,0,0)';
                div.style.border = (el.borderWidth || 0) + 'px solid ' + (el.borderColor || 'transparent');
                div.style.boxSizing = 'border-box';
                div.innerHTML = '';
                break;
            case 'columns':
                var wVal = (el.width !== undefined && el.width !== null) ? el.width.toString() : '100';
                div.style.width = getParsedWidth(wVal) + 'px';
                div.style.fontSize = el.fontSize + 'px';
                div.style.display = 'flex';
                div.style.gap = '10px';
                var lAlign = el.leftAlign || 'left';
                var rAlign = el.rightAlign || 'left';
                div.innerHTML = '<div style="flex:1;background:#f0f7ff;padding:2px;border-radius:3px;text-align:'+lAlign+'">'+el.left+'</div><div style="flex:1;background:#f0fff0;padding:2px;border-radius:3px;text-align:'+rAlign+'">'+el.right+'</div>';
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

    // 2. Now calculate total pages dynamically using the actual DOM heights
    var maxY = h; // At least one page height
    elements.forEach(function(el) {
        var elH = getElementHeight(el);
        var bottom = el.y + elH;
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
    var dom = document.querySelector('.el[data-id="' + el.id + '"]');
    if (dom) return dom.offsetHeight;
    if (el.type === 'rect') return el.rectH || 20;
    if (el.type === 'line') return el.lineWeight || 1;
    if (el.type === 'text' || el.type === 'var') return el.fontSize || 13;
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
                relX = Math.max(0, Math.min(parent.width - itemInfo.width, relX));
                relY = Math.max(0, Math.min(parent.height - itemInfo.height, relY));
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
                // If it wasn't dragged, toggle or select
                if (dragState.shouldDeselectOnMouseUp) {
                    selectElement(el.id, e);
                } else if (!e.ctrlKey && !e.metaKey) {
                    // Normal click: select exclusively
                    selectElement(el.id, e);
                }
            } else {
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
                            return (elCenterX >= pAbs.x && elCenterX <= pAbs.x + p.width &&
                                    elCenterY >= pAbs.y && elCenterY <= pAbs.y + p.height);
                        });
                        
                        var targetParentId = null;
                        if (containingPanels.length > 0) {
                            containingPanels.sort(function(a, b) {
                                return (a.width * a.height) - (b.width * b.height);
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
        pageHtml += '</select></div>';
        
        // Background color
        pageHtml += '<div class="prop-row"><label>Bg color</label><input type="color" value="'+(pageConfig.bgColor||'#ffffff')+'" onchange="setPageConfig(\'bgColor\',this.value)">';
        pageHtml += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setPageConfig(\'bgColor\',\'#ffffff\')">Reset</button></div>';
        
        // Margins: Left, Top, Right, Bottom
        pageHtml += '<h3>Margins (px)</h3>';
        pageHtml += '<div class="prop-row"><label>Left (L)</label><input type="number" value="'+pageConfig.marginLeft+'" onchange="setPageConfig(\'marginLeft\',+this.value)"></div>';
        pageHtml += '<div class="prop-row"><label>Top (T)</label><input type="number" value="'+pageConfig.marginTop+'" onchange="setPageConfig(\'marginTop\',+this.value)"></div>';
        pageHtml += '<div class="prop-row"><label>Right (R)</label><input type="number" value="'+pageConfig.marginRight+'" onchange="setPageConfig(\'marginRight\',+this.value)"></div>';
        pageHtml += '<div class="prop-row"><label>Bottom (B)</label><input type="number" value="'+pageConfig.marginBottom+'" onchange="setPageConfig(\'marginBottom\',+this.value)"></div>';
        
        panel.innerHTML = pageHtml;
        return;
    }
    var el = elements.find(function(e) { return e.id === selectedId; });
    if (!el) return;
    var h = '';
    h += '<div class="prop-row"><label>Type</label><input disabled value="'+el.type+'"></div>';
    h += '<div class="prop-row"><label>Layer name</label><input type="text" value="'+(el.customName||'')+'" onchange="setProp(\'customName\',this.value)" placeholder="Layer name..."></div>';
    
    // Group X and Y into a single Position row
    if (el.type !== 'pagebreak') {
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

    if (el.type !== 'pagebreak') {
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
    
    if (el.type !== 'panel' && el.type !== 'pagebreak') {
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
        h += '<div class="prop-row"><label>Text</label><textarea onchange="setProp(\'text\',this.value)">'+el.text+'</textarea></div>';
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
    }
    if (el.type === 'table') {
        h += '<div class="prop-row"><label>Headers</label><input value="'+el.headers.join(',')+'" onchange="setProp(\'headers\',this.value.split(\',\'))"></div>';
        h += '<div class="prop-row"><label>Show header</label><input type="checkbox" '+(el.showHeader!==false?'checked':'')+' onchange="setProp(\'showHeader\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Bind variable</label><select onchange="setProp(\'dataVar\',this.value)"><option value="">-- None --</option>';
        Object.keys(variables).forEach(function(k) {
            if (Array.isArray(variables[k])) {
                h += '<option '+(el.dataVar===k?'selected':'')+' value="'+k+'">'+k+'</option>';
            }
        });
        h += '</select></div>';
        h += '<div class="prop-row"><label>Field mappings</label><input value="'+(el.fieldMappings||'')+'" onchange="setProp(\'fieldMappings\',this.value)" placeholder="no,name,quantity" title="Comma-separated column fields"></div>';
        h += '<div class="prop-row"><label>Font size</label><input type="number" value="'+el.fontSize+'" onchange="setProp(\'fontSize\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Width</label><input type="text" value="'+el.width+'" onchange="setProp(\'width\',isNaN(this.value)||this.value.trim()===\'\'?this.value:+this.value)"></div>';
        h += '<div class="prop-row"><label>Widths</label><input value="'+el.widths+'" onchange="setProp(\'widths\',this.value)" placeholder="*,*,* or 30,*,80"></div>';
        h += '<div class="prop-row"><label>Header bold</label><input type="checkbox" '+(el.headerBold?'checked':'')+' onchange="setProp(\'headerBold\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Header aligns</label><input value="'+(el.headerAligns||'center')+'" onchange="setProp(\'headerAligns\',this.value)" placeholder="center,left,right" title="Comma-separated header alignments"></div>';
        h += '<div class="prop-row"><label>Body aligns</label><input value="'+(el.bodyAligns||'left')+'" onchange="setProp(\'bodyAligns\',this.value)" placeholder="left,center,right" title="Comma-separated body alignments"></div>';
        h += '<div class="prop-row"><label>Bold</label><input type="checkbox" '+(el.bold?'checked':'')+' onchange="setProp(\'bold\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Italic</label><input type="checkbox" '+(el.italic?'checked':'')+' onchange="setProp(\'italic\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Text color</label><input type="color" value="'+((el.color && el.color.startsWith('#')) ? el.color : '#000000')+'" onchange="setProp(\'color\',this.value)"></div>';
        h += '<div class="prop-row"><label>Col backgrounds</label><input value="'+(el.colFills||'')+'" onchange="setProp(\'colFills\',this.value)" placeholder="e.g. #eee,,#fff" title="Comma-separated column background colors"></div>';
        h += '<div class="prop-row"><label>Odd row bg</label><input type="color" value="'+((el.oddRowFill && el.oddRowFill.startsWith('#')) ? el.oddRowFill : '#ffffff')+'" onchange="setProp(\'oddRowFill\',this.value)">';
        h += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setProp(\'oddRowFill\',\'\')">Clear</button></div>';
        h += '<div class="prop-row"><label>Even row bg</label><input type="color" value="'+((el.evenRowFill && el.evenRowFill.startsWith('#')) ? el.evenRowFill : '#ffffff')+'" onchange="setProp(\'evenRowFill\',this.value)">';
        h += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setProp(\'evenRowFill\',\'\')">Clear</button></div>';
        h += '<div class="prop-row"><label>Border</label><input type="checkbox" '+(el.showBorder?'checked':'')+' onchange="setProp(\'showBorder\',this.checked)"></div>';
        h += '<div class="prop-row"><label>Border width</label><input type="number" step="0.5" value="'+(el.borderWidth||1)+'" onchange="setProp(\'borderWidth\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Border color</label><input type="color" value="'+((el.borderColor && el.borderColor.startsWith('#')) ? el.borderColor : '#000000')+'" onchange="setProp(\'borderColor\',this.value)"></div>';
    }
    if (el.type === 'columns') {
        h += '<div class="prop-row"><label>Left column</label><textarea onchange="setProp(\'left\',this.value)">'+el.left+'</textarea></div>';
        h += '<div class="prop-row"><label>Left align</label><select onchange="setProp(\'leftAlign\',this.value)">' +
             '<option '+(el.leftAlign==='left'?'selected':'')+' value="left">left</option>' +
             '<option '+(el.leftAlign==='center'?'selected':'')+' value="center">center</option>' +
             '<option '+(el.leftAlign==='right'?'selected':'')+' value="right">right</option>' +
             '<option '+(el.leftAlign==='justify'?'selected':'')+' value="justify">justify</option>' +
             '</select></div>';
        h += '<div class="prop-row"><label>Right column</label><textarea onchange="setProp(\'right\',this.value)">'+el.right+'</textarea></div>';
        h += '<div class="prop-row"><label>Right align</label><select onchange="setProp(\'rightAlign\',this.value)">' +
             '<option '+(el.rightAlign==='left'?'selected':'')+' value="left">left</option>' +
             '<option '+(el.rightAlign==='center'?'selected':'')+' value="center">center</option>' +
             '<option '+(el.rightAlign==='right'?'selected':'')+' value="right">right</option>' +
             '<option '+(el.rightAlign==='justify'?'selected':'')+' value="justify">justify</option>' +
             '</select></div>';
        h += '<div class="prop-row"><label>Font size</label><input type="number" value="'+el.fontSize+'" onchange="setProp(\'fontSize\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Width</label><input type="text" value="'+el.width+'" onchange="setProp(\'width\',isNaN(this.value)||this.value.trim()===\'\'?this.value:+this.value)"></div>';
    }
    if (el.type === 'panel') {
        h += '<div class="prop-row"><label>Width (W)</label><input type="number" value="'+el.width+'" onchange="setProp(\'width\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Height (H)</label><input type="number" value="'+el.height+'" onchange="setProp(\'height\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Bg color</label><input type="color" value="'+((el.bgColor && el.bgColor.startsWith('#')) ? el.bgColor : '#ffffff')+'" onchange="setProp(\'bgColor\',this.value)">';
        h += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setProp(\'bgColor\',\'transparent\')">Clear</button></div>';
        h += '<div class="prop-row"><label>Border width</label><input type="number" value="'+(el.borderWidth||0)+'" onchange="setProp(\'borderWidth\',+this.value)"></div>';
        h += '<div class="prop-row"><label>Border color</label><input type="color" value="'+((el.borderColor && el.borderColor.startsWith('#')) ? el.borderColor : '#cbd5e1')+'" onchange="setProp(\'borderColor\',this.value)">';
        h += '<button style="width:auto;margin:0 0 0 4px;padding:3px 6px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;cursor:pointer;" onclick="setProp(\'borderColor\',\'transparent\')">Clear</button></div>';
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
    if (!selectedId) return;
    var el = elements.find(function(e) { return e.id === selectedId; });
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
    if (!selectedId) return;
    var el = elements.find(function(e) { return e.id === selectedId; });
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
    if (k === 'shapeType' || k === 'dataVar' || k === 'isFx') {
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
        case 'columns':
            return '2 Columns';
        case 'panel':
            return 'Panel #' + el.id;
        case 'pagebreak':
            return 'Page Break (Y: ' + el.y + ')';
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
        Object.assign(el, { type:'image', imageSrc:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAADFLCArAAAAA1BMVEUzMzMrj16bAAAAR0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3wA7gAAB6PpYEwAAAABJRU5ErkJggg==', width:100, height:100, dataVar:key });
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
    if (el.type === 'text' || el.type === 'var' || el.type === 'shape' || el.type === 'columns' || el.type === 'image' || el.type === 'panel') {
        return getParsedWidth(el.width) || 100;
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
            var tableW = getElementWidth(el);
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
            var childrenLayout = buildLayout(children, 0, 0, imagesDict);
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

// ============================================================
// BUILD PDFMAKE DOCUMENT
// ============================================================
function buildLayout(elementsList, baseMarginLeft, baseMarginTop, imagesDict, pageBreakYs) {
    var content = [];
    
    // Filter out pagebreak and hidden elements from the layout calculations
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
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var avgY = row.reduce(function(sum, e){ return sum + e.y; }, 0) / row.length;
            if (Math.abs(el.y - avgY) < 10) { // Y threshold of 10 pixels
                row.push(el);
                placed = true;
                break;
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

    // Process each row
    rows.forEach(function(row) {
        // Sort elements in this row from left to right (X coordinate)
        row.sort(function(a, b) { return a.x - b.x; });
        
        var currentRowTop = Math.min.apply(null, row.map(function(e){ return e.y; }));
        
        // Check if we crossed any page break
        var crossedPB = null;
        if (activePBs.length > 0) {
            for (var i = 0; i < activePBs.length; i++) {
                var pbY = activePBs[i];
                if (prevRowBottom <= pbY && pbY <= currentRowTop) {
                    crossedPB = pbY;
                    // Remove all page breaks up to this one
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
            // Single element in this row
            var el = row[0];
            var node = elementToNode(el, imagesDict);
            if (node) {
                var leftMargin = el.x - baseMarginLeft;
                if (el.type === 'shape') {
                    var rSize = getRotatedSize(el.width || 100, el.height || 50, el.rotate || 0);
                    leftMargin = el.x - rSize.dx - baseMarginLeft;
                }
                var elW = getElementWidth(el);
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
            // Multiple elements on the same row: wrap in columns
            var columns = [];
            var firstEl = row[0];
            var colMarginLeft = firstEl.x - baseMarginLeft;
            if (firstEl.type === 'shape') {
                var rSize = getRotatedSize(firstEl.width || 100, firstEl.height || 50, firstEl.rotate || 0);
                colMarginLeft = firstEl.x - rSize.dx - baseMarginLeft;
            }

            var prevEnd = firstEl.x + getElementWidth(firstEl);
            if (firstEl.type === 'shape') {
                var rSize = getRotatedSize(firstEl.width || 100, firstEl.height || 50, firstEl.rotate || 0);
                prevEnd = (firstEl.x - rSize.dx) + rSize.w;
            }

            row.forEach(function(el, idx) {
                var node = elementToNode(el, imagesDict);
                if (node) {
                    var elW = getElementWidth(el);
                    
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

function buildDoc() {
    var imagesDict = {};
    
    // Sort all pagebreaks by Y coordinate
    var pageBreaks = elements.filter(function(e) { return e.type === 'pagebreak'; }).sort(function(a,b) { return a.y - b.y; });
    var pageBreakYs = pageBreaks.map(function(pb) { return pb.y; });
    
    // Only get top-level elements for the main document flow
    var topLevelElements = elements.filter(function(e) { return !e.parentId; });
    
    var content = buildLayout(topLevelElements, pageConfig.marginLeft, pageConfig.marginTop, imagesDict, pageBreakYs);
    
    return {
        pageSize: pageConfig.paperSize || 'LETTER',
        pageOrientation: pageConfig.paperOrient || 'portrait',
        pageMargins: [pageConfig.marginLeft, pageConfig.marginTop, pageConfig.marginRight, pageConfig.marginBottom],
        defaultStyle: { font: 'Roboto' },
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
                defaultFont: 'Roboto'
            };
            if (data.paper) pageConfig.paperSize = data.paper;
            if (data.orient) pageConfig.paperOrient = data.orient;
            idCounter = elements.reduce(function(m,e){return Math.max(m,e.id);},0);
            selectedId = null;
            selectedIds = [];
            updateAlignToolbar();
            changePaper();
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
            defaultFont: 'Roboto'
        };
        if (data.paper) pageConfig.paperSize = data.paper;
        if (data.orient) pageConfig.paperOrient = data.orient;
        idCounter = elements.reduce(function(m,e){return Math.max(m,e.id);},0);
        selectedId = null;
        selectedIds = [];
        updateAlignToolbar();
        changePaper();
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
        title = 'Fx Expression Editor (Variable)';
        desc = 'Enter JavaScript expression to calculate this variable\'s value. The returned result will be rendered on the document. Variables are accessed via the <code>$data</code> object.';
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
    
    // Check if elements are selected and user is not typing in inputs
    if (selectedIds.length > 0) {
        var activeTag = document.activeElement.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
            return;
        }
        
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
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
            e.preventDefault();
            render();
            renderProps();
        }
    }
});

// Sidebar Resizer Drag Logic
(function() {
    var resizer = document.getElementById('sidebarResizer');
    var app = document.querySelector('.app');
    var isResizing = false;

    resizer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        isResizing = true;
        resizer.classList.add('active');
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
            nextFrame.style.pointerEvents = 'auto';
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
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
    }
})();

// Init
render();
