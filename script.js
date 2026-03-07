/* Version: #13 */

// === SEKSJON: Data & Eksempler ===
const examples =[
    // Lineære
    { left: "2x - 4", right: "x + 4" },
    { left: "3x", right: "12" },
    { left: "5x + 2", right: "17" },
    // Brøk
    { left: "12/x", right: "4" },
    { left: "15/x + 2", right: "7" },
    { left: "24/x - 3", right: "5" },
    // Andregrad & Parenteser (CAS)
    { left: "x^2", right: "25" },
    { left: "x^2 + 6^2", right: "10^2" }, 
    { left: "2(x + 3)", right: "14" },
    { left: "3x^2", right: "27" }
];

let state = {
    lines:[], 
    currentStatus: 'IDLE', 
};

// === SEKSJON: Kjerne-Matematikk (Flate Polynomer) ===
// Denne delen håndterer ren algebra når trærne "klappes sammen".

function cleanState(poly) {
    let clean = {};
    for (let exp in poly) {
        let val = Math.round(poly[exp] * 100000) / 100000;
        if (val !== 0) clean[exp] = val;
    }
    return clean;
}

function polyAdd(p1, p2) {
    let res = {...p1};
    for (let k in p2) { res[k] = (res[k] || 0) + p2[k]; }
    return cleanState(res);
}

function polySub(p1, p2) {
    let res = {...p1};
    for (let k in p2) { res[k] = (res[k] || 0) - p2[k]; }
    return cleanState(res);
}

function polyMul(p1, p2) {
    let res = {};
    for (let k1 in p1) {
        for (let k2 in p2) {
            let newExp = parseInt(k1) + parseInt(k2);
            res[newExp] = (res[newExp] || 0) + (p1[k1] * p2[k2]);
        }
    }
    return cleanState(res);
}

function polyDiv(p1, p2) {
    let keys = Object.keys(p2);
    if (keys.length !== 1) throw "Kan ikke dele på komplekse uttrykk ennå.";
    let k2 = parseInt(keys[0]);
    let c2 = p2[k2];
    if (c2 === 0) throw "Kan ikke dele på null.";
    
    let res = {};
    for (let k1 in p1) {
        res[parseInt(k1) - k2] = p1[k1] / c2;
    }
    return cleanState(res);
}

function polyPow(poly, exp) {
    let keys = Object.keys(poly);
    if (keys.length === 1) {
        let k = parseInt(keys[0]);
        let res = {};
        res[k * exp] = Math.pow(poly[k], exp);
        return cleanState(res);
    }
    if (!Number.isInteger(exp) || exp < 0) throw "Kan bare opphøye i hele, positive tall.";
    if (exp === 0) return {0: 1};
    let res = {0: 1};
    for (let i = 0; i < exp; i++) res = polyMul(res, poly);
    return res;
}

function applySqrt(poly) {
    let keys = Object.keys(poly);
    if (keys.length > 1) throw "Isoler leddet før du tar kvadratrot! Du kan ikke ta roten av flere ledd samtidig.";
    if (keys.length === 0) return {};
    let exp = parseInt(keys[0]);
    let coef = poly[exp];
    if (coef < 0) throw "Kan ikke ta kvadratroten av et negativt tall i denne appen.";
    let newExp = exp / 2;
    if (!Number.isInteger(newExp)) throw `Kan ikke ta kvadratroten av x opphøyd i ${exp} på en ryddig måte her.`;
    let res = {};
    res[newExp] = Math.sqrt(coef);
    return cleanState(res);
}


// === SEKSJON: AST (Abstract Syntax Tree) Parser ===
// Forstår ligningens STRUKTUR og beholder den (f.eks 6^2 forblir en Pow-Node)

function uid() { return Math.random().toString(36).substr(2, 9); }

function tokenize(str) {
    let tokens =[];
    let i = 0;
    let s = str.replace(/\s+/g, '');
    while (i < s.length) {
        let char = s[i];
        if (/[+\-*/^()]/.test(char)) { tokens.push({type: char, val: char}); i++; continue; }
        if (char.toLowerCase() === 'x') { tokens.push({type: 'x', val: 'x'}); i++; continue; }
        if (/\d/.test(char) || char === '.') {
            let num = '';
            while (i < s.length && (/\d/.test(s[i]) || s[i] === '.')) { num += s[i]; i++; }
            tokens.push({type: 'NUM', val: parseFloat(num)});
            continue;
        }
        throw `Ukjent tegn: ${char}`;
    }
    return tokens;
}

function parseTokens(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function parseExpr() {
        let elements =[];
        let firstSign = 1;
        if (peek() && peek().type === '-') { consume(); firstSign = -1; }
        else if (peek() && peek().type === '+') { consume(); }
        
        elements.push({ sign: firstSign, node: parseTerm() });

        while (peek() && (peek().type === '+' || peek().type === '-')) {
            let op = consume().type;
            elements.push({ sign: op === '+' ? 1 : -1, node: parseTerm() });
        }
        
        // Hvis uttrykket bare har ett positivt ledd, trekk det ut for renere tre
        if (elements.length === 1 && elements[0].sign === 1) return elements[0].node;
        return { type: 'Expr', elements, id: uid() };
    }

    function parseTerm() {
        let node = parseFactor();
        while (peek()) {
            let p = peek();
            if (p.type === '*' || p.type === '/') {
                let op = consume().type;
                node = { type: op === '*' ? 'Mul' : 'Div', left: node, right: parseFactor(), implicit: false, id: uid() };
            } else if (p.type === 'NUM' || p.type === 'x' || p.type === '(') {
                node = { type: 'Mul', left: node, right: parseFactor(), implicit: true, id: uid() };
            } else break;
        }
        return node;
    }

    function parseFactor() {
        let node = parseBase();
        while (peek() && peek().type === '^') {
            consume();
            node = { type: 'Pow', left: node, right: parseBase(), id: uid() };
        }
        return node;
    }

    function parseBase() {
        let p = peek();
        if (!p) return { type: 'FlatPoly', poly: {0: 0}, id: uid() };
        if (p.type === '-') { consume(); return { type: 'Mul', left: { type: 'FlatPoly', poly: {0: -1}, id: uid() }, right: parseBase(), implicit: true, id: uid() }; }
        if (p.type === '+') { consume(); return parseBase(); }
        if (p.type === 'NUM') { consume(); return { type: 'FlatPoly', poly: {0: p.val}, id: uid() }; }
        if (p.type === 'x') { consume(); return { type: 'FlatPoly', poly: {1: 1}, id: uid() }; }
        if (p.type === '(') {
            consume();
            let inner = parseExpr();
            if (peek() && peek().type === ')') consume();
            else throw "Mangler sluttparentes ')'";
            return { type: 'Parens', inner: inner, id: uid() };
        }
        throw "Ugyldig uttrykk ved: " + p.val;
    }

    return parseExpr();
}

function parseSide(sideStr) {
    console.groupCollapsed(`[AST] Analyserer streng: "${sideStr}"`);
    let ast = parseTokens(tokenize(sideStr));
    console.log("Generert AST:", ast);
    console.groupEnd();
    return ast;
}


// === SEKSJON: Utregning av AST (Evaluering) ===

// Tvinger en node og alle dens barn til å bli et vanlig, flatt matematikk-objekt
function evaluateToPoly(node) {
    if (node.type === 'FlatPoly') return node.poly;
    if (node.type === 'Expr') {
        let res = {};
        for (let el of node.elements) {
            let p = evaluateToPoly(el.node);
            if (el.sign === 1) res = polyAdd(res, p);
            else res = polySub(res, p);
        }
        return res;
    }
    if (node.type === 'Mul') return polyMul(evaluateToPoly(node.left), evaluateToPoly(node.right));
    if (node.type === 'Div') return polyDiv(evaluateToPoly(node.left), evaluateToPoly(node.right));
    if (node.type === 'Pow') {
        let base = evaluateToPoly(node.left);
        let exp = evaluateToPoly(node.right);
        if (Object.keys(exp).length !== 1 || exp['0'] === undefined) throw "Eksponent må være tall";
        return polyPow(base, exp['0']);
    }
    if (node.type === 'Parens') return evaluateToPoly(node.inner);
    if (node.type === 'Sqrt') return applySqrt(evaluateToPoly(node.inner));
    return {0:0};
}


// === SEKSJON: Interaktivitet (Når brukeren KLIKKER på en Node) ===

// Regner kun ut akkurat den lille delen eleven klikker på
function performLocalSimplification(node) {
    if (node.type === 'Pow') {
        let base = evaluateToPoly(node.left);
        let exp = evaluateToPoly(node.right);
        if (Object.keys(exp).length !== 1 || exp['0'] === undefined) throw "Eksponent må være tall";
        return { type: 'FlatPoly', poly: polyPow(base, exp['0']), id: uid() };
    }
    if (node.type === 'Mul') {
        let isRightParen = node.right.type === 'Parens' && node.right.inner.type === 'Expr';
        let isLeftParen = node.left.type === 'Parens' && node.left.inner.type === 'Expr';

        // Ganger toeren inn i parentesen (Distribusjon)
        if (isRightParen) {
            return {
                type: 'Expr',
                elements: node.right.inner.elements.map(e => ({
                    sign: e.sign,
                    node: { type: 'Mul', left: node.left, right: e.node, implicit: node.implicit, id: uid() }
                })),
                id: uid()
            };
        } else if (isLeftParen) {
             return {
                type: 'Expr',
                elements: node.left.inner.elements.map(e => ({
                    sign: e.sign,
                    node: { type: 'Mul', left: e.node, right: node.right, implicit: node.implicit, id: uid() }
                })),
                id: uid()
            };
        }
        // Vanlig gange (f.eks 2 * 3x)
        return { type: 'FlatPoly', poly: polyMul(evaluateToPoly(node.left), evaluateToPoly(node.right)), id: uid() };
    }
    if (node.type === 'Div') {
        return { type: 'FlatPoly', poly: polyDiv(evaluateToPoly(node.left), evaluateToPoly(node.right)), id: uid() };
    }
    if (node.type === 'Parens') {
        return node.inner; // Fjerner parentesen
    }
    if (node.type === 'Sqrt') {
        return { type: 'FlatPoly', poly: applySqrt(evaluateToPoly(node.inner)), id: uid() };
    }
    return node;
}

window.triggerNodeClick = function(e, id) {
    e.stopPropagation(); // Hindrer at vi også klikker på noder bak denne
    
    let lastLine = state.lines[state.lines.length - 1];
    let changed = false;

    function traverseAndReplace(node) {
        if (!node) return node;
        if (node.id === id) {
            changed = true;
            return performLocalSimplification(node);
        }
        if (node.type === 'Expr') {
            return { ...node, elements: node.elements.map(e => ({ sign: e.sign, node: traverseAndReplace(e.node) })) };
        } else if (node.type === 'Mul' || node.type === 'Div' || node.type === 'Pow') {
            return { ...node, left: traverseAndReplace(node.left), right: traverseAndReplace(node.right) };
        } else if (node.type === 'Parens' || node.type === 'Sqrt') {
            return { ...node, inner: traverseAndReplace(node.inner) };
        }
        return node;
    }

    try {
        lastLine.mathState.lState = traverseAndReplace(lastLine.mathState.lState);
        lastLine.mathState.rState = traverseAndReplace(lastLine.mathState.rState);

        if (changed) {
            // Sjekk om ligningen ble løst gjennom dette klikket!
            try {
                let lFlat = evaluateToPoly(lastLine.mathState.lState);
                let rFlat = evaluateToPoly(lastLine.mathState.rState);
                if (isSolved(lFlat, rFlat)) {
                    state.currentStatus = 'SOLVED';
                    document.getElementById('success-message').classList.remove('hidden');
                }
            } catch(ignore) {}
            
            renderWorkspace();
        }
    } catch(err) {
        alert("Kan ikke utføre: " + err);
    }
};


// === SEKSJON: HTML Rendering av Tre-strukturen ===

function renderFlatPoly(poly) {
    let keys = Object.keys(poly).map(Number).sort((a,b)=>b-a);
    if (keys.length === 0) return `0`;
    let html = '';
    for (let i = 0; i < keys.length; i++) {
        let exp = keys[i];
        let coef = poly[exp];
        let abs = Math.abs(coef);
        
        let sign = '';
        if (i > 0) sign = coef < 0 ? ' - ' : ' + ';
        else if (coef < 0) sign = '-';

        let term = '';
        if (exp === 0) term = abs;
        else if (exp === -1) term = `<span class="fraction"><span class="numerator">${abs}</span><span class="denominator">x</span></span>`;
        else if (exp === 1) term = `${abs === 1 ? '' : abs}x`;
        else term = `${abs === 1 ? '' : abs}x<sup>${exp}</sup>`;

        html += sign + `<span class="math-term">${term}</span>`;
    }
    return html;
}

function renderAST(node) {
    if (node.type === 'FlatPoly') return renderFlatPoly(node.poly);
    
    // Noder som brukeren kan samhandle med:
    let wrap = (inner) => `<span class="interactive-node" onclick="triggerNodeClick(event, '${node.id}')" title="Trykk for å regne ut">${inner}</span>`;
    
    if (node.type === 'Pow') return wrap(`${renderAST(node.left)}<sup>${renderAST(node.right)}</sup>`);
    if (node.type === 'Parens') return wrap(`(${renderAST(node.inner)})`);
    if (node.type === 'Sqrt') return wrap(`&radic;(${renderAST(node.inner)})`);
    if (node.type === 'Mul') {
        let lHtml = renderAST(node.left);
        let rHtml = renderAST(node.right);
        return wrap(`${lHtml}${node.implicit ? '' : ' &middot; '}${rHtml}`);
    }
    if (node.type === 'Div') {
        return wrap(`<span class="fraction"><span class="numerator">${renderAST(node.left)}</span><span class="denominator">${renderAST(node.right)}</span></span>`);
    }
    if (node.type === 'Expr') {
        let html = '';
        node.elements.forEach((el, i) => {
            let signStr = '';
            if (i === 0) signStr = el.sign === -1 ? '-' : '';
            else signStr = el.sign === 1 ? ' + ' : ' - ';
            html += signStr + renderAST(el.node);
        });
        return `<span class="math-term">${html}</span>`;
    }
    return '';
}


// === SEKSJON: Spill-logikk & Operasjoner ===

function isSolved(lPoly, rPoly) {
    let lKeys = Object.keys(lPoly);
    let rKeys = Object.keys(rPoly);
    const isSingleX = (p, keys) => keys.length === 1 && keys[0] === '1' && p['1'] === 1;
    const isNumOnly = (p, keys) => keys.length === 1 && keys[0] === '0';
    if (lKeys.length === 0) lKeys = ['0'];
    if (rKeys.length === 0) rKeys =['0'];
    
    if (isSingleX(lPoly, lKeys) && isNumOnly(rPoly, rKeys)) return true;
    if (isSingleX(rPoly, rKeys) && isNumOnly(lPoly, lKeys)) return true;
    return false;
}

function startEquation(leftStr, rightStr) {
    try {
        let lParsed = parseSide(leftStr);
        let rParsed = parseSide(rightStr);
        state.lines =[{
            type: 'READY',
            mathState: { lState: lParsed, rState: rParsed },
            pastAction: null
        }];
        
        // Sjekk om ferdig evaluert er løst
        let solved = false;
        try { solved = isSolved(evaluateToPoly(lParsed), evaluateToPoly(rParsed)); } catch(e){}
        state.currentStatus = solved ? 'SOLVED' : 'WAITING_FOR_ACTION';
        
        document.getElementById('success-message').classList.add('hidden');
        renderWorkspace();
    } catch (err) {
        alert("Feil under oppstart: " + err);
    }
}

function appendActionToAST(ast, op, actionAst) {
    if (op === '+' || op === '-') {
        let sign = op === '+' ? 1 : -1;
        // Hvis vi trekker fra et stort uttrykk, wrap det i parantes så minuset treffer alt
        if (actionAst && actionAst.type === 'Expr' && actionAst.elements.length > 1) {
            actionAst = { type: 'Parens', inner: actionAst, id: uid() };
        }
        if (ast.type === 'Expr') return { ...ast, elements:[...ast.elements, { sign, node: actionAst }] };
        return { type: 'Expr', elements:[{sign: 1, node: ast}, {sign, node: actionAst}], id: uid() };
    } 
    else if (op === '*' || op === '/') {
        let needsParens = ast.type === 'Expr';
        let leftNode = needsParens ? { type: 'Parens', inner: ast, id: uid() } : ast;
        
        if (actionAst && actionAst.type === 'Expr' && actionAst.elements.length > 1) {
            actionAst = { type: 'Parens', inner: actionAst, id: uid() };
        }
        return { type: op === '*' ? 'Mul' : 'Div', left: leftNode, right: actionAst, implicit: false, id: uid() };
    } 
    else if (op === '√') {
        return { type: 'Sqrt', inner: ast, id: uid() };
    }
}

function handleActionSubmit(operator, actionStr) {
    if (operator !== '√' && (!actionStr || actionStr.trim() === '')) return;
    
    let lastLine = state.lines[state.lines.length - 1];
    lastLine.pastAction = operator === '√' ? '√' : `${operator} ${actionStr}`;

    let actionAST = operator !== '√' ? parseSide(actionStr) : null;
    let newL = appendActionToAST(lastLine.mathState.lState, operator, actionAST);
    let newR = appendActionToAST(lastLine.mathState.rState, operator, actionAST);

    state.lines.push({
        type: 'UNSIMPLIFIED',
        mathState: { lState: newL, rState: newR }
    });
    
    state.currentStatus = 'WAITING_FOR_SIMPLIFY';
    renderWorkspace();
}

// "Forenkle"-knappen. Regner ut ALT på raden.
function handleSimplify() {
    let unsimplifiedLine = state.lines[state.lines.length - 1];
    
    try {
        let flatL = evaluateToPoly(unsimplifiedLine.mathState.lState);
        let flatR = evaluateToPoly(unsimplifiedLine.mathState.rState);

        let simplifiedRow = {
            type: 'READY',
            mathState: {
                lState: { type: 'FlatPoly', poly: flatL, id: uid() },
                rState: { type: 'FlatPoly', poly: flatR, id: uid() }
            },
            pastAction: null
        };

        state.lines.push(simplifiedRow);
        
        if (isSolved(flatL, flatR)) {
            state.currentStatus = 'SOLVED';
            document.getElementById('success-message').classList.remove('hidden');
        } else {
            state.currentStatus = 'WAITING_FOR_ACTION';
        }
        renderWorkspace();
    } catch(err) {
        alert("Feil under utregning: " + err);
    }
}


// === SEKSJON: DOM & Rendering ===

function renderWorkspace() {
    const workspace = document.getElementById('workspace');
    workspace.innerHTML = '';

    state.lines.forEach((line, index) => {
        const isLastRow = (index === state.lines.length - 1);
        const rowDiv = document.createElement('div');
        rowDiv.className = 'math-row';
        
        const leftDiv = document.createElement('div');
        leftDiv.className = `left-side ${line.type === 'UNSIMPLIFIED' ? 'unsimplified' : ''}`;
        leftDiv.innerHTML = renderAST(line.mathState.lState);
        
        const equalsDiv = document.createElement('div');
        equalsDiv.className = 'equals';
        equalsDiv.textContent = '=';
        
        const rightDiv = document.createElement('div');
        rightDiv.className = `right-side ${line.type === 'UNSIMPLIFIED' ? 'unsimplified' : ''}`;
        rightDiv.innerHTML = renderAST(line.mathState.rState);
        
        const actionDiv = document.createElement('div');
        actionDiv.className = 'action-cell';

        if (line.pastAction) {
            actionDiv.innerHTML = `<span class="action-box">${line.pastAction}</span>`;
        } else if (isLastRow) {
            if (state.currentStatus === 'WAITING_FOR_ACTION' || state.currentStatus === 'SOLVED') {
                if (state.currentStatus !== 'SOLVED') {
                    actionDiv.innerHTML = `
                        <div class="active-action-panel">
                            <select id="op-select">
                                <option value="+">+</option>
                                <option value="-">-</option>
                                <option value="*">*</option>
                                <option value="/">/</option>
                                <option value="√">√</option>
                            </select>
                            <input type="text" id="action-input" placeholder="x" autocomplete="off">
                            <button id="btn-apply-action" class="btn-small">Utfør</button>
                        </div>
                    `;
                    setTimeout(() => bindActionEvents(), 0);
                }
            } else if (state.currentStatus === 'WAITING_FOR_SIMPLIFY') {
                actionDiv.innerHTML = `<button id="btn-simplify" class="btn-small btn-simplify">Regn ut & Forenkle</button>`;
                setTimeout(() => {
                    document.getElementById('btn-simplify').addEventListener('click', handleSimplify);
                }, 0);
            }
        }

        rowDiv.appendChild(leftDiv);
        rowDiv.appendChild(equalsDiv);
        rowDiv.appendChild(rightDiv);
        rowDiv.appendChild(actionDiv);
        workspace.appendChild(rowDiv);
    });
    
    const container = document.getElementById('workspace-container');
    container.scrollTop = container.scrollHeight;
}

function bindActionEvents() {
    const btn = document.getElementById('btn-apply-action');
    const input = document.getElementById('action-input');
    const select = document.getElementById('op-select');
    
    if(btn && input && select) {
        select.addEventListener('change', () => {
            if (select.value === '√') {
                input.style.display = 'none';
                input.value = '';
            } else {
                input.style.display = 'inline-block';
            }
        });
        btn.addEventListener('click', () => handleActionSubmit(select.value, input.value));
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') btn.click(); });
        input.focus();
    }
}

// === SEKSJON: Initialisering av Kontroller ===
document.getElementById('btn-load-example').addEventListener('click', () => {
    startEquation(examples[document.getElementById('example-select').value].left, examples[document.getElementById('example-select').value].right);
});

document.getElementById('btn-load-custom').addEventListener('click', () => {
    let l = document.getElementById('custom-left').value, r = document.getElementById('custom-right').value;
    if(l && r) startEquation(l, r); else alert("Fyll inn begge sider av ligningen.");
});

window.onload = () => startEquation(examples[0].left, examples[0].right);

/* Version: #13 */
