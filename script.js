/* Version: #7 */

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
    // Andregrad & Parenteser (Ny!)
    { left: "x^2", right: "25" },
    { left: "x^2 + 6^2", right: "10^2" }, // Pythagoras!
    { left: "2(x + 3)", right: "14" },
    { left: "3x^2", right: "27" }
];

// Applikasjonens Tilstand (State)
let state = {
    lines:[], 
    currentStatus: 'IDLE', 
};


// === SEKSJON: Matematikk-motor (Algebra & Polynomer) ===

/**
 * Rydder opp et matematikk-objekt ved å fjerne verdier som er 0
 */
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
    if (keys.length !== 1) throw "Kan ikke dele på uttrykk med flere ledd/parenteser i denne versjonen.";
    let k2 = parseInt(keys[0]);
    let c2 = p2[k2];
    if (c2 === 0) throw "Feil: Kan ikke dele på null.";
    
    let res = {};
    for (let k1 in p1) {
        res[parseInt(k1) - k2] = p1[k1] / c2;
    }
    return cleanState(res);
}

function polyPow(poly, exp) {
    let keys = Object.keys(poly);
    
    // Spesialhåndtering for enkle ledd, f.eks. x^-1, 2x^2
    if (keys.length === 1) {
        let k = parseInt(keys[0]);
        let c = poly[k];
        let res = {};
        res[k * exp] = Math.pow(c, exp);
        return cleanState(res);
    }
    
    if (!Number.isInteger(exp) || exp < 0) throw "Kan bare opphøye parenteser i hele, positive tall.";
    if (exp === 0) return {0: 1};
    
    let res = {0: 1};
    for (let i = 0; i < exp; i++) {
        res = polyMul(res, poly);
    }
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


// === SEKSJON: Parser (Lexer & Recursive Descent Parser) ===

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
            while (i < s.length && (/\d/.test(s[i]) || s[i] === '.')) {
                num += s[i]; i++;
            }
            tokens.push({type: 'NUM', val: parseFloat(num)});
            continue;
        }
        throw `Ukjent tegn: ${char}`;
    }
    return tokens;
}

function parseTokens(tokens) {
    let pos = 0;
    function peek() { return tokens[pos]; }
    function consume() { return tokens[pos++]; }

    // Expr -> Term (+/- Term)*
    function parseExpr() {
        let poly = parseTerm();
        while (peek() && (peek().type === '+' || peek().type === '-')) {
            let op = consume().type;
            let right = parseTerm();
            if (op === '+') poly = polyAdd(poly, right);
            else poly = polySub(poly, right);
        }
        return cleanState(poly);
    }

    // Term -> Factor (*/ Factor)* ELLER implicit multiplikasjon
    function parseTerm() {
        let poly = parseFactor();
        while (peek()) {
            let p = peek();
            if (p.type === '*' || p.type === '/') {
                let op = consume().type;
                let right = parseFactor();
                if (op === '*') poly = polyMul(poly, right);
                else poly = polyDiv(poly, right);
            } else if (p.type === 'NUM' || p.type === 'x' || p.type === '(') {
                // Implisitt multiplikasjon, f.eks "2x" eller "3(x+1)"
                let right = parseFactor();
                poly = polyMul(poly, right);
            } else {
                break;
            }
        }
        return poly;
    }

    // Factor -> Base (^ Base)*
    function parseFactor() {
        let poly = parseBase();
        while (peek() && peek().type === '^') {
            consume();
            let expNode = parseBase();
            let keys = Object.keys(expNode);
            if (keys.length !== 1 || expNode['0'] === undefined) throw "Eksponenten må være et vanlig tall.";
            poly = polyPow(poly, expNode['0']);
        }
        return poly;
    }

    // Base -> Unary Minus | Number | 'x' | '(' Expr ')'
    function parseBase() {
        let p = peek();
        if (!p) return {0: 0};
        if (p.type === '-') { consume(); return polyMul(parseBase(), {0: -1}); }
        if (p.type === '+') { consume(); return parseBase(); }
        if (p.type === 'NUM') { consume(); return {0: p.val}; }
        if (p.type === 'x') { consume(); return {1: 1}; }
        if (p.type === '(') {
            consume();
            let poly = parseExpr();
            if (peek() && peek().type === ')') consume();
            else throw "Mangler sluttparentes ')'";
            return poly;
        }
        throw "Ugyldig uttrykk ved: " + p.val;
    }

    return parseExpr();
}

/**
 * Hovedfunksjon for å oversette tekst til matematikk-objekt
 */
function parseSide(sideStr) {
    console.group(`[PARSER] Analyserer: "${sideStr}"`);
    let tokens = tokenize(sideStr);
    console.log("Tokens:", tokens);
    let poly = parseTokens(tokens);
    console.log("Ferdig polynom:", poly);
    console.groupEnd();
    return poly;
}


// === SEKSJON: Formatering til HTML ===

function formatSideToHTML(mathObj) {
    let keys = Object.keys(mathObj);
    if (keys.length === 0) return `<span class="math-term">0</span>`;
    
    // Sorter eksponenter synkende (x^2, x, tall, x^-1)
    let exps = keys.map(Number).sort((a, b) => b - a);
    let htmlElements =[];

    for (let i = 0; i < exps.length; i++) {
        let exp = exps[i];
        let coef = mathObj[exp];
        let absCoef = Math.abs(coef);
        
        let termHtml = "";
        let signStr = "";
        
        if (i === 0) {
            if (coef < 0) signStr = "-";
        } else {
            if (coef < 0) signStr = " - ";
            else signStr = " + ";
        }

        if (exp === 0) {
            termHtml = `<span class="math-term">${absCoef}</span>`;
        } else if (exp === -1) {
            // Ekte brøk-rendering for 1/x, 12/x etc.
            termHtml = `<span class="fraction"><span class="numerator">${absCoef}</span><span class="denominator">x</span></span>`;
        } else if (exp === 1) {
            let cStr = absCoef === 1 ? "" : absCoef;
            termHtml = `<span class="math-term">${cStr}x</span>`;
        } else {
            // Ekte opphøyd potens for x^2, x^3 etc.
            let cStr = absCoef === 1 ? "" : absCoef;
            termHtml = `<span class="math-term">${cStr}x<sup>${exp}</sup></span>`;
        }
        
        htmlElements.push(signStr + termHtml);
    }
    return htmlElements.join('');
}

function createUnsimplifiedHTML(formattedSideHTML, operator, actionStr, needsParens) {
    if (operator === '√') {
        return `<span class="math-term">√</span>(${formattedSideHTML})`;
    }
    
    // Prøv å formatere actionStr pent med parseren
    let actionHTML;
    try {
        let actPoly = parseSide(actionStr);
        actionHTML = formatSideToHTML(actPoly);
    } catch(e) {
        actionHTML = `<span class="math-term">${actionStr}</span>`;
    }

    if (operator === '*' || operator === '/') {
        let leftPart = needsParens ? `(${formattedSideHTML})` : formattedSideHTML;
        let actionNeedsParens = actionStr.includes('+') || (actionStr.includes('-') && !actionStr.startsWith('-'));
        let rightPart = actionNeedsParens ? `(${actionHTML})` : actionHTML;
        
        return `${leftPart} <span class="math-term">${operator}</span> ${rightPart}`;
    } else {
        return `${formattedSideHTML} <span class="math-term">${operator}</span> ${actionHTML}`;
    }
}


// === SEKSJON: Spill-logikk & Operasjoner ===

function isSolved(lState, rState) {
    let lKeys = Object.keys(lState);
    let rKeys = Object.keys(rState);

    const isSingleX = (stateObj, keys) => keys.length === 1 && keys[0] === '1' && stateObj['1'] === 1;
    const isNumberOnly = (stateObj, keys) => keys.length === 1 && keys[0] === '0';

    if (isSingleX(lState, lKeys) && isNumberOnly(rState, rKeys)) return true;
    if (isSingleX(rState, rKeys) && isNumberOnly(lState, lKeys)) return true;
    
    return false;
}

function applyMathAction(currentMathState, operator, actionStr) {
    let lState = { ...currentMathState.lState };
    let rState = { ...currentMathState.rState };
    
    try {
        if (operator === '√') {
            lState = applySqrt(lState);
            rState = applySqrt(rState);
        } else {
            let actionPoly = parseSide(actionStr);
            if (operator === '+') {
                lState = polyAdd(lState, actionPoly);
                rState = polyAdd(rState, actionPoly);
            } else if (operator === '-') {
                lState = polySub(lState, actionPoly);
                rState = polySub(rState, actionPoly);
            } else if (operator === '*') {
                lState = polyMul(lState, actionPoly);
                rState = polyMul(rState, actionPoly);
            } else if (operator === '/') {
                lState = polyDiv(lState, actionPoly);
                rState = polyDiv(rState, actionPoly);
            }
        }
        return { newState: { lState, rState }, error: null };
    } catch(err) {
        return { error: err.toString() };
    }
}

function startEquation(leftStr, rightStr) {
    console.clear();
    console.group(`=== STARTER NY LIGNING ===`);
    
    try {
        let lParsed = parseSide(leftStr);
        let rParsed = parseSide(rightStr);
        
        let cleanLeft = formatSideToHTML(lParsed);
        let cleanRight = formatSideToHTML(rParsed);

        state.lines =[{
            type: 'SIMPLIFIED',
            mathState: { lState: lParsed, rState: rParsed },
            displayLeft: cleanLeft,
            displayRight: cleanRight,
            pastAction: null
        }];
        
        state.currentStatus = isSolved(lParsed, rParsed) ? 'SOLVED' : 'WAITING_FOR_ACTION';
        document.getElementById('success-message').classList.add('hidden');
        renderWorkspace();
    } catch (err) {
        alert("Feil under lesing av ligning: " + err);
    }
    console.groupEnd();
}

function handleActionSubmit(operator, actionStr) {
    if (operator !== '√' && (!actionStr || actionStr.trim() === '')) return;
    
    let lastLine = state.lines[state.lines.length - 1];
    
    // For visualisering i input-historikk (også parser vi den så den blir pen)
    let actionHistoryHTML = operator === '√' ? '√' : `${operator} ${actionStr}`;
    lastLine.pastAction = actionHistoryHTML;

    let lNeedsParens = Object.keys(lastLine.mathState.lState).length > 1;
    let rNeedsParens = Object.keys(lastLine.mathState.rState).length > 1;

    let unsimplifiedRow = {
        type: 'UNSIMPLIFIED',
        displayLeft: createUnsimplifiedHTML(lastLine.displayLeft, operator, actionStr, lNeedsParens),
        displayRight: createUnsimplifiedHTML(lastLine.displayRight, operator, actionStr, rNeedsParens),
        pendingOperator: operator,
        pendingActionStr: actionStr 
    };
    
    state.lines.push(unsimplifiedRow);
    state.currentStatus = 'WAITING_FOR_SIMPLIFY';
    renderWorkspace();
}

function handleSimplify() {
    let unsimplifiedLine = state.lines[state.lines.length - 1];
    let lastMathState = state.lines[state.lines.length - 2].mathState;
    
    let mathResult = applyMathAction(lastMathState, unsimplifiedLine.pendingOperator, unsimplifiedLine.pendingActionStr);
    
    if (mathResult.error) {
        alert(mathResult.error);
        state.lines.pop();
        state.lines[state.lines.length - 1].pastAction = null;
        state.currentStatus = 'WAITING_FOR_ACTION';
        renderWorkspace();
        return;
    }

    let newMathState = mathResult.newState;
    let simplifiedRow = {
        type: 'SIMPLIFIED',
        mathState: newMathState,
        displayLeft: formatSideToHTML(newMathState.lState),
        displayRight: formatSideToHTML(newMathState.rState),
        pastAction: null
    };

    state.lines.push(simplifiedRow);
    
    if (isSolved(newMathState.lState, newMathState.rState)) {
        state.currentStatus = 'SOLVED';
        document.getElementById('success-message').classList.remove('hidden');
    } else {
        state.currentStatus = 'WAITING_FOR_ACTION';
    }
    renderWorkspace();
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
        leftDiv.innerHTML = line.displayLeft; // Bruker innerHTML for brøker og sup
        
        const equalsDiv = document.createElement('div');
        equalsDiv.className = 'equals';
        equalsDiv.textContent = '=';
        
        const rightDiv = document.createElement('div');
        rightDiv.className = `right-side ${line.type === 'UNSIMPLIFIED' ? 'unsimplified' : ''}`;
        rightDiv.innerHTML = line.displayRight;
        
        const actionDiv = document.createElement('div');
        actionDiv.className = 'action-cell';

        if (line.type === 'SIMPLIFIED') {
            if (line.pastAction) {
                actionDiv.innerHTML = `<span class="action-box">${line.pastAction}</span>`;
            } else if (isLastRow && state.currentStatus === 'WAITING_FOR_ACTION') {
                actionDiv.innerHTML = `
                    <div class="active-action-panel">
                        <select id="op-select">
                            <option value="+">+</option>
                            <option value="-">-</option>
                            <option value="*">*</option>
                            <option value="/">/</option>
                            <option value="√">√</option>
                        </select>
                        <input type="text" id="action-input" placeholder="f.eks. x" autocomplete="off">
                        <button id="btn-apply-action" class="btn-small">Utfør</button>
                    </div>
                `;
                
                setTimeout(() => {
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

                        btn.addEventListener('click', () => {
                            handleActionSubmit(select.value, input.value);
                        });
                        
                        input.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter') btn.click();
                        });
                        
                        input.focus();
                    }
                }, 0);
            }
        } else if (line.type === 'UNSIMPLIFIED') {
            if (isLastRow && state.currentStatus === 'WAITING_FOR_SIMPLIFY') {
                actionDiv.innerHTML = `<button id="btn-simplify" class="btn-small btn-simplify">Regn ut & Forenkle</button>`;
                setTimeout(() => {
                    const btn = document.getElementById('btn-simplify');
                    if(btn) btn.addEventListener('click', handleSimplify);
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

// === SEKSJON: Initialisering av Kontroller ===
document.getElementById('btn-load-example').addEventListener('click', () => {
    const select = document.getElementById('example-select');
    const eq = examples[select.value];
    startEquation(eq.left, eq.right);
});

document.getElementById('btn-load-custom').addEventListener('click', () => {
    const left = document.getElementById('custom-left').value;
    const right = document.getElementById('custom-right').value;
    if(left && right) {
        startEquation(left, right);
    } else {
        alert("Fyll inn begge sider av ligningen.");
    }
});

// Start
window.onload = () => {
    const eq = examples[0];
    startEquation(eq.left, eq.right);
};

/* Version: #7 */
