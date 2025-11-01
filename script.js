// Get HTML Elements

const editor = document.getElementById('editor');
const svg = document.getElementById('flowchart');
const status = document.getElementById('status-message');

const STORAGE_KEY = 'flowchart_source_v1'

// Local Storage Save

function saveSource(text){
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch (e) {
    // Private mode or quota full
    console.warn('localStorage save failed:', e);
  }
}

// Collapsed Constants

const collapsed = new Set();
let currentModel = null;

// Set Node Box Sizes

const NODE_W = 130;
const NODE_H = 46;

// Set Node Gaps

const X_GAP = 36, Y_GAP = 80;

// Status Message Function

function setStatus(ok, message){

	status.textContent = message;
	status.style.color = ok ? '#0a0' : '#a00';
  
}

// Collapsed Helper

function mergeCollapseState(oldSet, newNodes){
    
  for(const id of Array.from(oldSet)){
      
    if(!newNodes[id]) oldSet.delete(id);
  }
}

// Clear SVG Function

function clearSvg(){ svg.innerHTML = ''; }

// Create SVG Element Function

function createElement(name, attributes) {
	
	const element = document.createElementNS('http://www.w3.org/2000/svg', name);
	
	for (const [key, value] of Object.entries(attributes)) {
		
		element.setAttribute(key, value);
		
	}
	
	return element;
	
}

// Draw Node Function

function drawNode(id, title, x, y, childrenCount) {
  const isCollapsed = collapsed.has(id);

  const group = createElement('g', { transform: `translate(${x},${y})`, cursor: 'pointer' });

  const rect = createElement('rect', {
    width: NODE_W, height: NODE_H,
    rx: 8, ry: 8,
    fill: '#fff', stroke: '#333'
  });

  const label = createElement('text', {
    x: NODE_W / 2,
    y: NODE_H / 2,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-size': '12'
  });

  label.textContent = (title || id) + (isCollapsed ? ' [+]' : (childrenCount ? ' [–]' : ''));

  group.addEventListener('click', (event) => {
    event.stopPropagation();
    if (childrenCount) {
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      setStatus(true, (collapsed.has(id) ? 'Collapsed ' : 'Expanded ') + (title || id));
      render(currentModel);
    }
  });

  group.append(rect, label);
  svg.appendChild(group);
  return { group, rect, label };
}


// Draw Edge Function

function drawEdge(parentX, parentY, childX, childY) {

	const parentCenterX = parentX + NODE_W / 2;
	const parentBottomY = parentY + NODE_H;
	const childCenterX = childX + NODE_W / 2;
	const childTopY = childY;

	const midpointY = (parentBottomY + childTopY) / 2;

	const pathDefinition = [
	
		`M ${parentCenterX} ${parentBottomY}`,
		`L ${parentCenterX} ${midpointY}`,
		`L ${childCenterX} ${midpointY}`,
		`L ${childCenterX} ${childTopY}`
	
	].join(' ');

	const pathElement = createElement('path', {
	
		d: pathDefinition,
		stroke: '#666',
		'stroke-width': '1.2',
		fill: 'none'
	
	});

	svg.appendChild(pathElement);
}

// Fit View Box Function

function fitViewBox() {
    
    if (!svg.firstChild) return;

	const padding = 30;
	const boundingBox = svg.getBBox();
	
	const width = Math.max(200, boundingBox.width + 2 * padding);
	const height = Math.max(150, boundingBox.height + 2 * padding);
	const xPosition = boundingBox.x - padding;
	const yPosition = boundingBox.y - padding;
	
	svg.setAttribute('viewBox', `${xPosition} ${yPosition} ${width} ${height}`);
}

// Parse Text Function 

function parse(text){
    
	const lines = text.split(/\r?\n/);
	
	const nodes = {};
	const edges = [];
	let lineNum = 0;
	
	for (const raw of lines){
		
		lineNum++;
		
		const line = raw.trim();
		
		if(!line) continue; // This skips empty lines.
		
		if(line.startsWith('node ')){
			
			const match = line.match(/^node\s+(\S+)\s+"([^"]*)"?$/);
			
			if (!match) return {error: `Line ${lineNum}: Bad Node Syntax`};
			
			const [, id, title] = match;
			
			if(nodes[id]) return {error: `Line ${lineNum}: Duplicate Node id "${id}"`};
			
			nodes[id] = {id, title: title || id, children: []};
			
			continue;
			
		} else if(line.startsWith('edge ')){
			
			const match = line.match(/^edge\s+(\S+)\s*->\s*(\S+)$/);
			
			if (!match) return { error: `Line ${lineNum}: Bad Edge Syntax` };
			
			edges.push({from: match[1], to: match[2], line: lineNum});
			
			continue;
			
		} else {
			
			return {error: `Line ${lineNum}: Unknown Directive`};
			
		}
		
	}
	
	for (const edge of edges){
		
		if (!nodes[edge.from]) return {error: `Line ${edge.line}: Unknown Node "${edge.from}"`};
		
		if(!nodes[edge.to]) return {error: `Line ${edge.line}: unknown node "${edge.to}"`}; 
		
		nodes[edge.from].children.push(edge.to);
		
	}
	
	const targets = new Set(edges.map(edge => edge.to));
	
	const root = Object.keys(nodes).find(id => !targets.has(id)) || Object.keys(nodes)[0];
	
	if (!root) return {error: 'No Nodes Defined'};
	
	return {nodes, edges, root};
    
}

// Create FlowChart Layout

function visibleChildren(id, nodes){
    
    if(collapsed.has(id)) return [];
    
    return(nodes[id].children || []);
    
}

function layoutTree(model){
    
    const {nodes, root} = model;
    
    const xPosition = new Map();
    let xPositionNext = 0;
    
    const depth = new Map();
    
    function children(id){ return visibleChildren(id, nodes); }
    
    function firstPass(id, d){
        
        depth.set(id, d);
        
        const kids = children(id);
        
        if(kids.length === 0){
            
            xPosition.set(id, xPositionNext++);
            
        } else{
            
            kids.forEach(k => firstPass(k, d+1)); // Place Children First
            
            const xKidPositions = kids.map(k => xPosition.get(k));
            
            xPosition.set(id, (Math.min(...xKidPositions) + Math.max(...xKidPositions)) / 2) // Centres Parent Between Children
            
        }
        
    }
    
    firstPass(root, 0);
    
    const vis = new Set();
    
    (function depthFirstSearch(id){
        
        if(vis.has(id)) return;
        
        vis.add(id);
        
        children(id).forEach(depthFirstSearch);
        
    })(root);
    
    const coords = {};
    
    for (const id of vis){
        
        coords[id] = {
            
            x: xPosition.get(id) * (NODE_W + X_GAP),
            y: (depth.get(id) || 0) * (NODE_H + Y_GAP)
            
        };
        
    }
    
    
  return {coords, vis};
  
}


// Draw Diagram

function render(model){
    
    currentModel = model;
    
    clearSvg();
    
    svg.setAttribute('role', 'img');
    
    const {coords, vis} = layoutTree(model);
    
    // Draw Edges First
    
    for (const id of vis){
        
        const node = model.nodes[id];
        
        for (const idChild of node.children || []){
            
            if (!vis.has(idChild)) continue;
            
            drawEdge(coords[id].x, coords[id].y, coords[idChild].x, coords[idChild].y)
            
        }
    }
    
    // Draw Nodes
    
    for (const id of vis){
        
        const node = model.nodes[id];
        
        const totalCount = (node.children || []).length;
        
        drawNode(id, node.title || id, coords[id].x, coords[id].y, totalCount);
    
    }
    
    fitViewBox();
    
}


// Handle Text Input

const onInput = () => {
    
    saveSource(editor.value);
    
    const result = parse(editor.value);
    
    if (result.error){
        
        setStatus(false, result.error);
        
        clearSvg();
        
        return;
    }
    
    mergeCollapseState(collapsed, result.nodes);
    
    setStatus(true, `Parsed ${Object.keys(result.nodes).length} Nodes`);
    
    render(result);
}

// Debounce Function To Delay Rendering

function debounce(fn, ms){
    
    let t;
    
    return (...args) =>{
        
        clearTimeout(t);
        
        t = setTimeout(()=>fn(...args), ms);
        
    };
    
}

editor.addEventListener('input', debounce(onInput, 120));

const saved = localStorage.getItem(STORAGE_KEY);
if (saved != null) editor.value = saved;

onInput();