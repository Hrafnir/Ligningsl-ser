/* Version: #5 */

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
    // Andregrad (Pythagoras)
    { left: "x^2", right: "25" },
    { left: "x^2 + 16", right: "25" },
    { left: "2x^2 - 8", right: "0" },
    { left: "3x^2", right: "27" }
];

// Applikasjonens Tilstand (State)
let state = {
    lines:[], // Array av alle rader
    currentStatus: 'IDLE', // 'WAITING_FOR_ACTION' eller 'WAITING_FOR_SIMPLIFY' eller 'SOLVED'
};

// === SEKSJON: Matematikk & Parser (Algebra-motor v2) ===

/**
 * Rydder opp et matematikk-objekt ved å fjerne verdier som er 0 (eller veldig nær 0 pga avrundingsfeil)
 */
function cleanState(mathObj) {
    let clean = {};
    for (let exp in mathObj) {
        // Avrunder for å unngå flyttallsfeil, f.eks. 0.0000000000000001
        let val = Math.round(mathObj[exp] * 10000) / 10000;
        if (val !== 0) {
            clean[exp] = val;
        }
    }
    return clean;
}

/**
 * Analyserer en tekststreng og konverterer den til et eksponent-basert objekt
 * Eksempel: "2x^2 - 5/x + 3" -> { "2": 2, "-1": -5, "0": 3 }
 */
function parseSide(sideStr) {
    console.group(`[PARSER] Analyserer: "${sideStr}"`);
    
    let parsedState = {};
    
    // Fjerner mellomrom og standardiserer minus for enkel splitting
    let cleanStr = sideStr.replace(/\s+/g, '').replace(/-/g, '+-');
    if (cleanStr.startsWith('+')) cleanStr = cleanStr.substring(1);
    
    let terms = cleanStr.split('+').filter(t => t !== '');
    console.log(`[PARSER] Fant ledd:`, terms);

    for (let term of terms) {
        if (term.includes('x^2')) {
            let valStr = term.replace('x^2', '');
            let coef = (valStr === '' || valStr === '+') ? 1 : (valStr === '-' ? -1 : parseFloat(valStr));
            parsedState['2'] = (parsedState['2'] || 0) + coef;
        } else if (term.includes('/x')) {
            let valStr = term.replace('/x', '');
            parsedState['-1'] = (parsedState['-1'] || 0) + parseFloat(valStr);
        } else if (term.includes('x')) {
            let valStr = term.replace('x', '');
            let coef = (valStr === '' || valStr === '+') ? 1 : (valStr === '-' ? -1 : parseFloat(valStr));
            parsedState['1'] = (parsedState['1'] || 0) + coef;
        } else {
            parsedState['0'] = (parsedState['0'] || 0) + parseFloat(term);
        }
    }
    
    let finalState = cleanState(parsedState);
    console.log(`[PARSER] Oversatt til internt objekt:`, finalState);
    console.groupEnd();
    
    return finalState;
}

/**
 * Konverterer det interne objektet tilbake til en pen matematisk tekststreng
 */
function formatSide(mathObj) {
    if (Object.keys(mathObj).length === 0) return "0";
    
    let res = "";
    // Sorterer nøkler (eksponenter) synkende for standardisert visning (x^2 først, så x, tall, /x)
    let exps = Object.keys(mathObj).map(Number).sort((a, b) => b - a);

    for (let exp of exps) {
        let coef = mathObj[exp];
        let termStr = "";
        let absCoef = Math.abs(coef);

        if (exp === 2) {
            termStr = (absCoef === 1 ? "" : absCoef) + "x^2";
        } else if (exp === 1) {
            termStr = (absCoef === 1 ? "" : absCoef) + "x";
        } else if (exp === 0) {
            termStr = absCoef;
        } else if (exp === -1) {
            termStr = absCoef + "/x";
        } else {
            termStr = (absCoef === 1 ? "" : absCoef) + "x^" + exp; // Fallback for ukjente eksponenter
        }

        if (res === "") {
            res += (coef < 0 ? "-" : "") + termStr;
        } else {
            res += (coef < 0 ? " - " : " + ") + termStr;
        }
    }
    
    return res;
}

/**
 * Endrer eksponenten på alle ledd (brukes ved ganging/deling med X)
 */
function shiftExponents(mathObj, shiftAmount) {
    let newState = {};
    for (let exp in mathObj) {
        let newExp = parseInt(exp) + shiftAmount;
        newState[newExp] = mathObj[exp];
    }
    return newState;
}

/**
 * Kvadratrot-logikk. Inneholder sikkerhetsnett mot vanlige matematikk-feil.
 */
function applySqrtToSide(mathObj) {
    let keys = Object.keys(mathObj);
    
    // Hindre eleven i å ta kvadratrot av blandede ledd som (x^2 + 16)
    if (keys.length > 1) {
        return { error: "Du kan ikke ta kvadratroten direkte av flere ledd. Isoler x^2 først!" };
    }
    
    if (keys.length === 0) return { state: {} };

    let exp = keys[0];
    let coef = mathObj[exp];

    if (coef < 0) {
        return { error: "Du kan ikke ta kvadratroten av et negativt tall i denne appen." };
    }

    if (exp === '2') {
        return { state: { '1': Math.sqrt(coef) } }; // Kvadratroten av cx^2 blir sqrt(c)x
    } else if (exp === '0') {
        return { state: { '0': Math.sqrt(coef) } }; // Kvadratroten av c blir sqrt(c)
    } else {
        return { error: `Kan ikke ta kvadratrot av leddet med eksponent ${exp}.` };
    }
}

/**
 * Hovedfunksjon for å utføre matematikk.
 */
function applyMathAction(currentMathState, operator, actionStr) {
    console.group(`[MATH ENGINE] Utfører operasjon: ${operator} ${actionStr || ''}`);
    console.log("Før-tilstand:", currentMathState);

    let lState = { ...currentMathState.lState };
    let rState = { ...currentMathState.rState };
    let error = null;

    if (operator === '+' || operator === '-') {
        // Gjenbruker parseren for å forstå hva som skal legges til/trekkes fra
        let actionObj = parseSide(actionStr);
        let sign = operator === '+' ? 1 : -1;
        
        for (let exp in actionObj) {
            lState[exp] = (lState[exp] || 0) + (actionObj[exp] * sign);
            rState[exp] = (rState[exp] || 0) + (actionObj[exp] * sign);
        }
    } 
    else if (operator === '*' || operator === '/') {
        let cleanInput = actionStr.trim().toLowerCase();
        let isX = cleanInput === 'x';
        let val = isX ? 1 : parseFloat(cleanInput);

        if (isNaN(val) && !isX) {
            error = "Ugyldig tall for ganging/deling.";
        } else if (operator === '/' && !isX && val === 0) {
            error = "Det er ikke mulig å dele på null!";
        } else {
            if (operator === '*') {
                if (isX) {
                    lState = shiftExponents(lState, 1);
                    rState = shiftExponents(rState, 1);
                } else {
                    for (let exp in lState) lState[exp] *= val;
                    for (let exp in rState) rState[exp] *= val;
                }
            } else if (operator === '/') {
                if (isX) {
                    lState = shiftExponents(lState, -1);
                    rState = shiftExponents(rState, -1);
                } else {
                    for (let exp in lState) lState[exp] /= val;
                    for (let exp in rState) rState[exp] /= val;
                }
            }
        }
    } 
    else if (operator === '√') {
        let leftRes = applySqrtToSide(lState);
        let rightRes = applySqrtToSide(rState);

        if (leftRes.error) error = "Venstre side: " + leftRes.error;
        else if (rightRes.error) error = "Høyre side: " + rightRes.error;
        else {
            lState = leftRes.state;
            rState = rightRes.state;
        }
    }

    let finalState = {
        lState: cleanState(lState),
        rState: cleanState(rState)
    };

    if (error) {
        console.warn(`[MATH ENGINE] Avbrutt med feil: ${error}`);
    } else {
        console.log("Etter-tilstand:", finalState);
    }
    console.groupEnd();

    return { newState: finalState, error: error };
}

/**
 * Lager den uforenklede visningsstrengen
 */
function createUnsimplifiedString(formattedSide, operator, actionStr) {
    if (operator === '√') {
        return `√(${formattedSide})`;
    } else if (operator === '*' || operator === '/') {
        // Enkel paranteslogikk for å vise at hele siden ganges/deles
        let needsParentheses = formattedSide.includes('+') || formattedSide.includes('-');
        return needsParentheses ? `(${formattedSide}) ${operator} ${actionStr}` : `${formattedSide} ${operator} ${actionStr}`;
    } else {
        return `${formattedSide} ${operator} ${actionStr}`;
    }
}

/**
 * Sjekker om ligningen er ferdig løst (x står alene og er lik et tall)
 */
function isSolved(lState, rState) {
    let lKeys = Object.keys(lState);
    let rKeys = Object.keys(rState);

    // Hjelpefunksjon: Sjekker om tilstanden er nøyaktig "1x"
    const isSingleX = (stateObj, keys) => keys.length === 1 && keys[0] === '1' && stateObj['1'] === 1;
    // Hjelpefunksjon: Sjekker om tilstanden kun er et rent tall
    const isNumberOnly = (stateObj, keys) => keys.length === 1 && keys[0] === '0';

    if (isSingleX(lState, lKeys) && isNumberOnly(rState, rKeys)) return true;
    if (isSingleX(rState, rKeys) && isNumberOnly(lState, lKeys)) return true;
    
    return false;
}


// === SEKSJON: Spill-logikk & Flyt ===

function startEquation(leftStr, rightStr) {
    console.clear();
    console.group(`=== STARTER NY LIGNING: ${leftStr} = ${rightStr} ===`);
    
    let lParsed = parseSide(leftStr);
    let rParsed = parseSide(rightStr);
    
    let cleanLeft = formatSide(lParsed);
    let cleanRight = formatSide(rParsed);

    state.lines =[{
        type: 'SIMPLIFIED',
        mathState: { lState: lParsed, rState: rParsed },
        displayLeft: cleanLeft,
        displayRight: cleanRight,
        pastAction: null
    }];
    
    state.currentStatus = isSolved(lParsed, rParsed) ? 'SOLVED' : 'WAITING_FOR_ACTION';
    
    document.getElementById('success-message').classList.add('hidden');
    console.groupEnd();
    renderWorkspace();
}

function handleActionSubmit(operator, actionStr) {
    if (operator !== '√' && (!actionStr || actionStr.trim() === '')) return;
    
    let lastLine = state.lines[state.lines.length - 1];
    
    // 1. Visuelt marker forrige linje
    lastLine.pastAction = operator === '√' ? '√' : `${operator} ${actionStr}`;

    // 2. Generer ny UFORENKLET linje
    let unsimplifiedRow = {
        type: 'UNSIMPLIFIED',
        displayLeft: createUnsimplifiedString(lastLine.displayLeft, operator, actionStr),
        displayRight: createUnsimplifiedString(lastLine.displayRight, operator, actionStr),
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
    
    // Regn ut ny matematikk
    let mathResult = applyMathAction(lastMathState, unsimplifiedLine.pendingOperator, unsimplifiedLine.pendingActionStr);
    
    if (mathResult.error) {
        alert(mathResult.error);
        // Angrer den uforenklede linjen hvis matematikken er ulovlig
        state.lines.pop();
        state.lines[state.lines.length - 1].pastAction = null;
        state.currentStatus = 'WAITING_FOR_ACTION';
        renderWorkspace();
        return;
    }

    let newMathState = mathResult.newState;
    let newLeftDisplay = formatSide(newMathState.lState);
    let newRightDisplay = formatSide(newMathState.rState);

    let simplifiedRow = {
        type: 'SIMPLIFIED',
        mathState: newMathState,
        displayLeft: newLeftDisplay,
        displayRight: newRightDisplay,
        pastAction: null
    };

    state.lines.push(simplifiedRow);
    
    // Sjekk om løst
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
        leftDiv.textContent = line.displayLeft;
        
        const equalsDiv = document.createElement('div');
        equalsDiv.className = 'equals';
        equalsDiv.textContent = '=';
        
        const rightDiv = document.createElement('div');
        rightDiv.className = `right-side ${line.type === 'UNSIMPLIFIED' ? 'unsimplified' : ''}`;
        rightDiv.textContent = line.displayRight;
        
        const actionDiv = document.createElement('div');
        actionDiv.className = 'action-cell';

        if (line.type === 'SIMPLIFIED') {
            if (line.pastAction) {
                // Historikkboks
                actionDiv.innerHTML = `<span class="action-box">${line.pastAction}</span>`;
            } else if (isLastRow && state.currentStatus === 'WAITING_FOR_ACTION') {
                // Aktivt inputpanel
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
                
                // Bind events 
                setTimeout(() => {
                    const btn = document.getElementById('btn-apply-action');
                    const input = document.getElementById('action-input');
                    const select = document.getElementById('op-select');
                    
                    if(btn && input && select) {
                        // Skjul tekstboks hvis bruker velger kvadratrot (krever ikke input)
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
                // Forenkle-knapp
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
    
    // Auto-scroll til bunnen
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

// Start med første ligning når siden laster
window.onload = () => {
    const eq = examples[0];
    startEquation(eq.left, eq.right);
};

/* Version: #5 */
