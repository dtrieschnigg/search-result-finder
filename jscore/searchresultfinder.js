/*
* SearchResultFinder JavaScript Library
*
* Author: Dolf Trieschnigg
* $Id: searchresultfinder.js 31 2012-01-09 10:32:11Z trieschn $
* $Revision: 31 $
* $Date: 2012-01-09 11:32:11 +0100 (Mon, 09 Jan 2012) $
*/

// this module requires: 
// jquery.js
// jshashtable-2.1.js 

{
	// bugfix for pages which include an old version of the Prototype js package
	// remove overloaded functions of the Array prototype
	var a = [];
	for(var i in a) if (!a.hasOwnProperty(i)) delete Array.prototype[i];
	delete a;
}

// bind function (for FF < 4)
{
	if ( !Function.prototype.bind ) {
		Function.prototype.bind = function( obj ) {
    		if(typeof this !== 'function') // closest thing possible to the ECMAScript 5 internal IsCallable function
      			throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
    		var slice = [].slice,
        	args = slice.call(arguments, 1), 
        	self = this, 
        	nop = function () {}, 
        	bound = function () {
          		return self.apply( this instanceof nop ? this : ( obj || {} ), 
					args.concat( slice.call(arguments) ) );    
        	};

    		bound.prototype = this.prototype;

    		return bound;
  		};
	}
	
	if (!String.prototype.endsWith) {
		String.prototype.endsWith = function(str) {
			return (this.match(str+"$")==str)
		}
	}
}

var SearchResultFinder = {};
// ------------------------- Finder -----------------------------------
// The Finder is used to find and rank search result wrappers in a DOMTree
// 

SearchResultFinder.Options = {
	useSimilarity: true, 			// should similarity thresholds be used for pruning and ranking
	useAttributeTable: true,		// should attributes be used in xpaths
	removeInvisibleNodes: true,		// should invisible nodes be ignored
	useGrid: true,					// should single rows be removed, should number of nodes roughly correspond to grid size
	removeRows: true,				// should "row-results" be removed
	minSimilarityThreshold: 0.55,
	avgSimilarityThreshold: 0.65,
	minRepetition: 4,
	reset: function() { 			// resets options to defaults
		SearchResultFinder.Options.useSimilarity = true;
		SearchResultFinder.Options.useAttributeTable = true;
		SearchResultFinder.Options.removeInvisibleNodes = true;
		SearchResultFinder.Options.useGrid = true;
		SearchResultFinder.Options.removeRows = true;
		SearchResultFinder.Options.useSimilarity = true;
		SearchResultFinder.Options.minSimilarityThreshold = 0.55;
		SearchResultFinder.Options.avgSimilarityThreshold = 0.65;
		SearchResultFinder.Options.minRepetition = 3;
	}
}

SearchResultFinder.Finder = function(doc) {
	this.doc = doc;
	this.wrappers = [];
}

SearchResultFinder.Finder.prototype = {
	doc: null,			// document used for finding the wrapper
	wrappers: null,		// wrappers found by this Finder object
	elapsedTime: -1,
	seen: null, 		// xpaths visited
	log: function(message) {
	},
	/*
	searches the document for search result wrappers
	*/
	find: function() {
		// keep track of time
		var start = new Date();
		
		this.wrappers = [];

		// step 1: find repeating xpaths
		var xpaths = this.findRepeatingXpaths();
		
		// step 2: generate candidate wrappers
		for (var xpath in xpaths) {
			this.log(xpath + " (" + xpaths[xpath] + " nodes)");
			this.findCandidates(xpath);
		}

		// step 3: rank candidates
		this.log("Ranking " + this.wrappers.length + " candidates");
		this.wrappers = this.wrappers.sort(
			this.getRankingFunction()
		);
		
		// step 4: remove "rows" of results:
		if (SearchResultFinder.Options.removeRows) {
			this.removeRows();
		}
		
		// keep track of elapsed time
		var end = new Date();
		this.elapsedTime = end.getTime() - start.getTime();
	},
	/*
	depending on the options set, returns a function to rank the candidate wrappers
	*/
	getRankingFunction: function() {
		if (SearchResultFinder.Options.useSimilarity) {
			return function(a,b) {
				// systems with a similarity higher than the thresholds are ranked highest
				// then rank by decending area 
				var at = a.minSimilarity > SearchResultFinder.Options.minSimilarityThreshold && 
					a.avgSimilarity > SearchResultFinder.Options.avgSimilarityThreshold;
				var bt = b.minSimilarity > SearchResultFinder.Options.minSimilarityThreshold && 
					b.avgSimilarity > SearchResultFinder.Options.avgSimilarityThreshold;
				return (bt - at) || (b.area - a.area) || (a.xpath.length - b.xpath.length); 
			}
		} else {
			return function(a,b) {
				// only rank by using the area 
				return (b.area - a.area) || (a.xpath.length - b.xpath.length); 
			}
		}
	},
	/*
	removes wrappers which subsume other wrappers with a multiple of results
	*/
	removeRows: function() {
		var removeIds = {};
		var numItems = this.wrappers.length;
		outer: for (var i = 0; i < numItems; i++) {
			var w1 = this.wrappers[i];
			for (var j = i + 1; j < numItems; j++) {
				var w2 = this.wrappers[j];
				
				if (removeIds[i]) {
					continue outer;
				}
				if (!removeIds[j]) {
					var pi = i;
					var ci = j;
					var p = w1;
					var c = w2;
					if (w1.nodes.length > w2.nodes.length) {
						pi = j;
						ci = i;
						p = w2;
						c = w1;
					}
					// invariant: p is possible parent, c is possible child
				
					if (c.isGrid && !p.isGrid &&
						c.minSimilarity > SearchResultFinder.Options.minSimilarityThreshold &&
						c.avgSimilarity > SearchResultFinder.Options.avgSimilarityThreshold &&
						((p.nodes.length - 1) * 2 <= c.nodes.length) &&	// p contains more than twice as many nodes as c
						this.subsumes(p, c) // all nodes in c have a parent in the nodes of p
					) {
						// wrapper with index pi should be removed
						this.log("Wrapper " + p.xpath + " contains rows of " + c.xpath);
						removeIds[pi] = 1;
					}
				}
			}
		}
		for (var id in removeIds){
			delete this.wrappers[id];
		}
		// fix numbering in array
		this.wrappers = SearchResultFinder.Helper.arrayValues(this.wrappers);		
		
	},
	/*
	searches for anchors in the page and returns the generalized xpaths of these anchors (finding at least minRepetition anchors)
	*/
	findRepeatingXpaths: function() {
		this.log("Searching for anchors in " + jQuerySRF("title", this.doc).text());
		
		// search for link tags
		var nodes = SearchResultFinder.Helper.getNodes(this.doc, "//a");
		var xpaths = {}; // xpath -> [number of nodes, number of links]
		for (var i = 0; i < nodes.length; i++) {
			var simplePath = SearchResultFinder.Helper.getSimpleXpath(nodes[i]);
			if (xpaths[simplePath]) {
				xpaths[simplePath] = xpaths[simplePath] + 1;
			} else {
				xpaths[simplePath] = 1;
			}
		}
		// remove xpaths retrieving too few nodes
		for (var xpath in xpaths) {
			if (xpaths[xpath][0] < SearchResultFinder.Options.minRepetition)
				delete xpaths[xpath];
		}
		
		this.log("Found " + SearchResultFinder.Helper.arrayLength(xpaths) + " generalized paths");

		return xpaths;	
	},
	/**
	 * for two wrappers p and c
	 * returns true when each node in p has a child in c and
	 *   each node in c has a parent in p
	 */
	subsumes: function(p, c) {
		var parents = new Hashtable();
		for (var i in p.nodes) {
			parents.put(p.nodes[i], 1);
		}		
		var parentsSeen = new Hashtable();

		// each node in c should have an ancestor in p
		outer: for (var i in c.nodes) {
			var parent = c.nodes[i].parentNode;			
			while (parent != null) {
				if (parents.containsKey(parent)) {
					parentsSeen.put(parent, 1);
					continue outer;
				}
				parent = parent.parentNode;
			}
			return false; // this node in c does not have a ancestor in p
		}
		// all nodes in p should have a child in c
		return parentsSeen.size() == parents.size();
	},
	/*
		finds candidates xpaths (including xpaths with attributes)
		adds found candidates to the this.wrappers objects
	*/
	findCandidates: function(xpath) {
		this.seen = [];
		
		var nodes = SearchResultFinder.Helper.getNodes(this.doc, xpath);
		
		if (nodes != null && nodes.length > SearchResultFinder.Options.minRepetition) {
			var wnodes = SearchResultFinder.Helper.createWrapperNodes(nodes);
			// not necessary anymore, since all nodes _are_ anchors
			// for (var i = 0; i < wnodes.length; i++) {
			// 	if (wnodes[i].node.localName != "a") {
			// 		wnodes[i].getAttributes().push(".//a");			
			// 	}
			// }
			
			var numNodes = wnodes.length;
			// create a table with all the attributes used in the nodes and ancestors
			var at = new SearchResultFinder.AttributeTable(wnodes);
			at.log = this.log;
			at.buildTable();
			
			// remove attributes which return too few nodes or return all nodes
			at.filter(
				function(depth, attribute, count) {
					return count < SearchResultFinder.Options.minRepetition || count == numNodes;
				}.bind(this)
			);

			// get the predicates and construct xpath candidates
			var attributes = at.sortAttributes();
			var xb = new SearchResultFinder.XpathBuilder(xpath);
			this.findMore(xb);
			// this.addWrapper(this.simplify2(xb.toString()));
			
			if (SearchResultFinder.Options.useAttributeTable) {
				for (var i in attributes) {// attribute[i] -> [depth, attribute, count]
					xb.addPredicate(attributes[i][0], attributes[i][1]);
			
					// var p = xb.toString();
					this.findMore(xb)
			
					xb.removePredicate(attributes[i][0], attributes[i][1]);
				}
				// Possible future work: also try combinations of attributes
			}
		}
	},
	addWrapper2: function(xpath) {
		if (this.seen[xpath]) return;
		else {
			this.seen[xpath] = 1;
			
			var simple = this.simplify(xpath);
			if (this.seen[simple]) return;
			else {
				this.seen[simple] = 1;
				this.addWrapper(simple);
			}
		}
	},
	findMore: function(xb) {
		// this.addWrapper(this.simplify2(xb.toString()));
		var xpath = xb.toString();
		this.log("Finding more paths for " + xpath);
		var nodes = SearchResultFinder.Helper.getNodes(this.doc, xpath);
		if (nodes == null) {
			this.log("ERROR: " + xpath + " resulted in 0 nodes");
		} else {
			var nodeCount = nodes.length;
			// try all the xpaths at a higher level
			for (var i = 1; i < xb.parts.length - 1; i++) {
				var xpath2 = xb.levelUpString(i);
				if (this.seen[xpath2]) {
					nodeCount = -1;
					break;
				}
				var nodeCount2 = SearchResultFinder.Helper.getNodes(this.doc, xpath2).length;
				this.log("Testing " + xpath2 + " [" + nodeCount2 + " nodes]");
				if (nodeCount2 == nodeCount) { // xpath at a higher level retrieves same number of nodes
					xpath = xpath2;
				} else {
					// keep xpath as candidate wrapper and continue
					this.addWrapper2(xpath);
					xpath = xpath2;
					nodeCount = nodeCount2;
					if (nodeCount < SearchResultFinder.Options.minRepetition) break;
				}
			}
			if (nodeCount >= SearchResultFinder.Options.minRepetition) {
				this.addWrapper2(xpath);
			}
		
			// try all the xpaths at a higher level by reducing the number of involved parts
			/* TODO: do as option
			xpath = xb.toString();
			nodeCount = SearchResultFinder.Helper.getNodes(this.doc, xpath).length;
			for (var i = 1; i < xb.parts.length - 1; i++) {
				var xpath2 = xb.reducedLevelString(i);
				if (this.seen[xpath2]) break;
			
				var nodeCount2 = SearchResultFinder.Helper.getNodes(this.doc, xpath2).length;
				if (nodeCount2 == nodeCount) { // xpath at a higher level retrieves same number of nodes
					xpath = xpath2;
				} else {
					// keep xpath as candidate wrapper and continue
					this.addWrapper2(xpath);
					xpath = xpath2;
					nodeCount = nodeCount2;
					if (nodeCount < SearchResultFinder.Options.minRepetition) break;
				}
			}
			*/
		}
	},
	addWrapper: function(xpath) {
		this.log("Adding wrapper " + xpath);
		var w = new SearchResultFinder.Wrapper(this.doc, xpath);
		if (w.nodes != null) {	// sanity check
			for (var i = 0; i < this.wrappers.length; i++) {
				// test whether we already have found a wrapper finding the same nodes
				if (this.wrappers[i].equalNodes(w)) {
					this.wrappers[i].addAlternativeXpath(xpath);					
					return;
				}
			}			
			
			// test for invisible nodes
			if (!SearchResultFinder.Options.removeInvisibleNodes || !w.hasInvisibleNodes(0.6)) {
				// test grid
				if (!SearchResultFinder.Options.useGrid || (
						w.grid[0] > 1 // not a single row
						&& ((w.grid[0] + 1) * w.grid[1] >= w.nodes.length)	// number of nodes roughly corresponds to grid size	
					)) {
					this.wrappers.push(w);
				} else {
					this.log("fails grid constraints " + w.grid);
				}
			} else {
				this.log("too many invisible nodes");
			}		
		} else {
			this.log("Warning: Xpath " + xpath + " does not retrieve any nodes, ignored");
		}
	},
	simplify: function(xpath) {
		return SearchResultFinder.Helper.simplifyXpath(this.doc, xpath);
	},
	toString: function() {
		var result = "<table>";
		result += "<tr><th>Nr</th><th>Xpath</th><th># Nodes</th><th>Area</th><th>Min</th><th>Max</th></tr>";
		
		for (var i = 0; i < this.wrappers.length; i++) {
			var w = this.wrappers[i];
			result += "<tr>" +
				"<td>"+ (i+1) + "</td>" +	
				"<td>"+ w.xpath + "</td>" +	
				"<td>"+ w.wnodes.length + "</td>" +	
				"<td>"+ Math.floor(w.area) + "</td>" +	
				"<td>"+ w.minSimilarity.toFixed(2) + "</td>" +
				"<td>"+ w.avgSimilarity.toFixed(2) + "</td>" +
				"</tr>"
		}		
		result += "</table>";
		return result;
	}
}

// ------------------------- WrapperNode -----------------------------------
// A wrapper node represents a Dom Node with some additional useful attributes
//

SearchResultFinder.WrapperNode = function(node) {
	this.node = node;
	this.attributes = null;
}

SearchResultFinder.WrapperNode.prototype = {
	node: null,
	area: -1, // area in pixels
	left: -1,
	right: -1,
	top: -1,
	bottom: -1,
	invisible: null,
	attributes: null, // list of attribute-value keys
	struct: null, // array representing the underlying structure
	depth: -1, // depth in the html tree (/html = 0, /html/body = 1 etc.)
	calcArea: function() {
		// determines
		var n = jQuerySRF(this.node); // use jquery functions for convenience
		var offset = n.offset();

		this.invisible = n.is(':hidden') 
			|| n.css('visibility') == 'hidden' 
			|| n.css('opacity') == 0; // known BUG: does not check opacity of parents

		// visibility: hidden or opacity: 0
		if (this.invisible) {
			this.left = 0;
			this.right = 0;
			this.top = 0;
			this.bottom = 0;
			this.area = 0;
		} else {
			var w, h;
			
			if (n.width() > 0) {
				w = n.outerWidth();
			} else {
				w = SearchResultFinder.Helper.determineSizeByChildren(n, true);				
			}
			if (n.height() > 0) {
				h = n.outerHeight();
			} else {
				h = SearchResultFinder.Helper.determineSizeByChildren(n, false);				
			}
			
			this.left = offset.left;
			this.right = this.left + w;
			this.top = offset.top;
			this.bottom = this.top + h;
			this.area = w * h;
		}
	},
	isInVisible: function() {
		if (this.invisible == null) this.calcArea();
		return this.invisible;
	},
	getArea: function() {
		if (this.area == -1) this.calcArea();
		return this.area;
	},
	getLeft: function() {
		if (this.left == -1) this.calcArea();
		return this.left;
	},
	getRight: function() {
		if (this.right == -1) this.calcArea();
		return this.right;
	},
	getTop: function() {
		if (this.top == -1) this.calcArea();
		return this.top;
	},
	getBottom: function() {
		if (this.bottom == -1) this.calcArea();
		return this.bottom;
	},
	getAttributes: function() {
		if (this.attributes == null) {
			this.attributes = [];
			if (this.node.hasAttributes && this.node.hasAttributes()) {
				var attrs = this.node.attributes;
				for (var i = 0; i < attrs.length; i++) {
					var name = attrs[i].name;
					
					if (name.indexOf(":") == -1 && name.toLowerCase() != 'href') { // ignore attributes with names containing a colon :
						var value = attrs[i].value;
						if ((value.indexOf('"') == -1) && // ignore attributes with values containing a quote or apostrophe
							(value.indexOf('\'') == -1)	) { 
						
							var m;
							var a;
							// TODO: handle escpaes properly
							if (name == "id" && (m = /^([^\d]+)(\d+)$/.exec(value))) {
								// special rule for handling ids with numbers
								this.attributes.push('starts-with(@'+ name + ',\'' + m[1] + '\')');
							} else if (name == "class") {	
								// split multiple classes
								var cv = value.split(/\s+/);
								for (var j in cv) {
									if (cv[j].length > 0)
										this.attributes.push('contains(@' + name + ',\'' + cv[j] + '\')');
								}
							} else {
								this.attributes.push('@' + name + '=\'' + value + '\'');
							}
						}
					}
				}
			}
		}
		return this.attributes;
	},
	getStruct: function() {
		if (this.attributes == null) {
			// TODO: this code can be optimized for speed
			var struct = [];
			var nodes = SearchResultFinder.Helper.getNodes(this.node.ownerDocument, ".//*", this.node);
			for (var i in nodes) {
				var name = SearchResultFinder.Helper.nodeName(nodes[i], this.node);
				if (struct[name]) struct[name]++;
				else struct[name] = 1;
			}
			this.struct = struct;
		}
		return this.struct;
	},
	getDepth: function() {
		if (this.depth == -1) {
			this.depth = SearchResultFinder.Helper.getDepth(this.node);			
		}
		return this.depth;
	},
	toString: function() {
		var result = "[" + this.node.localName.toLowerCase() + ";";
		result += "top=" + this.top + ";";
		result += "left=" + this.left + ";";
		result += "right=" + this.right + ";";
		result += "bottom=" + this.bottom + ";";
		result += "area=" + this.area + ";";
		result += "struct=" + this.struct + ";";
		result += "]";
		return result;
		
	}
}

// ------------------------- Wrapper -----------------------------------
// The wrapper represents a set of candidate search engine results which
// can be captured with a single xpath
//

SearchResultFinder.Wrapper = function(doc, xpath) {
	this.doc = doc;
	this.xpath = xpath;
	this.alternativeXpaths = [];
	
	this.nodes = SearchResultFinder.Helper.getNodes(doc, xpath);
	if (this.nodes == null)
		this.wnodes = null;
	else 
		this.wnodes = SearchResultFinder.Helper.createWrapperNodes(this.nodes);
	
	if (this.wnodes != null) {
		// determine area, bounding box and grid
		this.area = 0; 
		var tbb = null;
		for (var i = 0; i < this.wnodes.length; i++) {
			var wn = this.wnodes[i];
			this.area += wn.getArea();
			var bb = [wn.top, wn.left, wn.bottom, wn.right];
			if (tbb == null) {
				tbb = bb;
			} else {
				for (var j = 0; j < 2; j++) { // take minimum top and left
					if (bb[j] < tbb[j])
						tbb[j] = bb[j];
				}
				for (var j = 2; j < 4; j++) { // take maximum bottom and right
					if (bb[j] > tbb[j])
						tbb[j] = bb[j];
				}
			}
		}
		this.boundingBox = tbb;
		this.grid = null;
		this.isGrid(); // determines columns and rows

		// determine the minimum and maximum similarity between nodes in this wrapper
		this.minSimilarity = Infinity;
		this.avgSimilarity = -Infinity;
		
		var combinedStruct = [];
		// determine combined struct
		for (var i = 0; i < this.wnodes.length; i++) {
			var struct = this.wnodes[i].getStruct();
			for (var j in struct) {
				if (combinedStruct[j]) {
					combinedStruct[j]++;
				} else {
					combinedStruct[j] = 1;
				}
			}
		}
		// determine average distance and minimal distance to combinedStruct
		var sum = 0;
		for (var i = 0; i < this.wnodes.length; i++) {
			var struct = this.wnodes[i].getStruct();
			var sim = SearchResultFinder.Helper.cosine(
				struct,
				combinedStruct
			);
			sum += sim;
			if (this.minSimilarity > sim) {
				this.minSimilarity = sim;
			}
		}
		this.avgSimilarity = sum / this.wnodes.length;
	}
}

SearchResultFinder.Wrapper.prototype = {
	doc: null,
	xpath: null,
	wnodes: null,
	nodes: null,
	boundingBox: null, // [top, left, bottom, right]
	area: -1,
	minSimilarity: -1,
	avgSimilarity: -1,
	isGrid: null,
	grid: null,
	alternativeXpaths: null,
	toString: function() {
		return "["+ this.xpath + ", " + this.wnodes.length + " nodes: " + this.wnodes + "; grid: " + this.isGrid + "]";
	},
	equalNodes: function(other) {
		var n1 = this.nodes;
		var n2 = other.nodes;
		if (n1.length != n2.length) return false;
		else {
			for (var i = 0; i < n1.length; i++) {
				if (n1[i] != n2[i]) return false;
			}
			return true;
		}
	},
	equals: function(wrapper) {
		if (wrapper instanceof SearchResultFinder.Wrapper) {
			if (this.xpath == wrapper.xpath) return true;
		}
		return false;		
	},
	addAlternativeXpath: function(alternative) {
		if (alternative.length < this.xpath.length) {
			var newalt = this.xpath;
			this.xpath = alternative;
			alternative = newalt;
		}
		this.alternativeXpaths.push(alternative);		
	},	
	hasInvisibleNodes: function(percentage) {
		var c = 0;
		for (var i in this.wnodes) {
			if (this.wnodes[i].isInVisible()) {
				c++;
			}
		}
		if ((c / this.nodes.length) > percentage) {
			return true;
		} else return false;
	},
	isGrid: function() {
		if (this.grid == null) {
			// determine area, bounding box and grid
			var grid = [{}, {}]; 
			// 0 (top): coordinate -> count, left (1): coordinate -> count
			for (var i = 0; i < this.wnodes.length; i++) {
				var wn = this.wnodes[i];
				wn.getArea();
				var bb = [wn.top, wn.left, wn.bottom, wn.right];
				for (var j = 0; j < 2; j++) {
					if (grid[j][bb[j]]) {
						grid[j][bb[j]] = grid[j][bb[j]] + 1;
					} else {
						grid[j][bb[j]] = 1;
					}
				}
			}
			
		
			// determine whether this result box has the shape of a grid
			// counts the number of repetitions
			// 0 (left): repetition => number of occurrences
			// 1 (top): repetition => number of occurrences
			var rep = [{}, {}];
			var guess = [0, 0]; // guess at number of rows, columns
			for (var j = 0; j < 2; j++) {
				for (var i in grid[j]) {
					var v = grid[j][i]; // i is the left/top value, v the number of appearances
					if (rep[j][v])
						rep[j][v] = rep[j][v] + 1;
					else 
						rep[j][v] = 1;
				}
				// rep[0] and rep[1] are typically small
				// numitems -> seen
				var m = 0;
				for (var i in rep[j]) {
					if (rep[j][i] > m) {
						m = rep[j][i];
						guess[j] = i;
					}
				}
			}
		
			this.grid = [parseInt(guess[1]), parseInt(guess[0])]; // swap for row x cols
			this.isGrid = ((guess[0] > 1) && (guess[1] > 1)); // + "([" + guess[0] + "," + guess[1] + "])";
		}
		return this.isGrid;
	},
	toSnippetsXml: function(url, time) {
		var xps = [this.xpath];
		for (var i = 0; i < this.alternativeXpaths.length; i++) {
			xps.push(this.alternativeXpaths[i]);
		}
		return SearchResultFinder.Helper.nodesToSnippetsXml(url, this.doc, this.nodes, time, this.xpath, xps);
	}
}

// ------------------------- AttributeTable -----------------------------------
// attribute table keeps track of the attributes used at different levels
// known bug:
// when there are ids with the same prefix, followed by numbers and not followed by numbers
// e.g. id=abc, id=abc1 and id=abc2

SearchResultFinder.AttributeTable = function(wnodes) {
	this.wnodes = wnodes;
	this.attributes = null;
	this.sortedAttributes = null;
}

SearchResultFinder.AttributeTable.prototype = {
	wnodes: null, // nodes found with this xpath
	attributes: null, // depth -> attribute -> string of length wnodes.length (0 or 1's)
	sortedAttributes: null, // array of [depth, attribute, count] sorted by descending count
	/*
	 * builds the attribute table based on the xpath and wnodes 
	 */
	buildTable: function() {
		this.attributes = [];
		var ancestors = this.getAncestors(this.wnodes);
		var length = this.wnodes.length;
		ancestors.each(function(ancestor, nodeids) {
			var wnode = new SearchResultFinder.WrapperNode(ancestor);
			var attributes = wnode.getAttributes();
			if (attributes.length > 0) {
				var depth = wnode.getDepth();
				for (var i in attributes) {
					this.addAttribute(depth,attributes[i],this.nodeIdsToString(nodeids, length));
				}
			}
					
		}.bind(this));
		
		this.filterAttributes();	// FIXME: turn this back on!
	},
	/**
	 * returns an array with indices as a string with at the indices 
	 */
	nodeIdsToString: function(nodeids, length) {
		var b = new Array(length);
		for (var i in nodeids) {
			b[nodeids[i]] = true;
		}
		var result = "";
		for (var i = 0; i < length; i++) {
			if (b[i]) result += "1";
			else result += "0";
		}
		return result;
	},
	stringToNodes: function(nodeStr) {
		var result = [];
		for (var i = 0; i < nodeStr.length; i++) {
			if (nodeStr[i] == "1")
				result.push(this.wnodes[i]);
		}
		return result;
	},
	orNodeStr: function(nodeStr1, nodeStr2) {
		// assumes the strings are of same length!
		var result = "";
		for (var i = 0; i < nodeStr1.length; i++) {
			if ((nodeStr1[i] == '1') || (nodeStr2[i] == '1')) {
				result += "1";
			} else result += "0";
		}
		return result;		
	},
	/* used for debugging and verbose output */
	log: function(message) {
	},
	/**
	 * filters attributes which result in exactly the same set of nodes
	 */
	filterAttributes: function() {
		// this.log("Before removing attributes which result in the same set:" + this.toString());
		
		var attr = this.sortAttributes2(
			function(a,b) {
			return (b[0] - a[0])  // sort by descending depth
				|| (a[1].length - b[1].length)  // then sort by ascending attribute length
			}
		);
		
		var seen = []; // nodestr -> 1 
	
		for (var i = 0; i < attr.length; i++) {
			var a = attr[i]; // [depth, attribute, length]
				var nodeStr = this.attributes[a[0]][a[1]];
				if (seen[nodeStr]) {
					delete this.attributes[a[0]][a[1]];
				}
				seen[nodeStr] = 1;
		}
		this.removeEmpty();
		// this.log("After removing attributes which result in the same set:" + this.toString());
	},
	// removes empty attributes list from the this.attributes structure
	removeEmpty: function() {
		// remove empty attribute lists
		for (var depth in this.attributes) {
			if (SearchResultFinder.Helper.arrayLength(this.attributes[depth]) == 0) {
				delete this.attributes[depth];
			}
		}	
	},
	/*
	 * private function to remember which nodes match which attribute selector 
	 */
	addAttribute: function(depth, attribute, nodeids) {
		if (!this.attributes[depth]) {
			this.attributes[depth] = [];
		}
		if (!this.attributes[depth][attribute]) {
			this.attributes[depth][attribute] = nodeids;
		} else {
			this.attributes[depth][attribute] = 
				this.orNodeStr(this.attributes[depth][attribute], nodeids);
//			throw "Attribute already set";
		}
	},
	/*
	 * private function to get the ancestors of a set of wnodes 
	 * returns
	 * ancestor -> array of node ids in wnodes
	 */
	getAncestors: function(wnodes) {
		var ancestors = new Hashtable();
		for (var i in wnodes) {
			var p = wnodes[i].node;
			while (p != null) {
				if (!ancestors.containsKey(p)) ancestors.put(p, []);
				ancestors.get(p).push(i);
				p = p.parentNode;
			}
		}
		return ancestors;
	},
	/*
	 * Filters the attributes using the given function
	 */
	filter: function(filterfunction) {
		// iterate over all attributes in this table and remove them when required
		for (var depth in this.attributes) {
			for (var attribute in this.attributes[depth]) {
				if (filterfunction(depth, attribute, this.stringToNodes(this.attributes[depth][attribute]).length)) {
					delete this.attributes[depth][attribute];
				}
			}
		}
		this.removeEmpty();	
	},
	// sortfunction gets two arrays to compare: [depth, attribute, count]
	sortAttributes2: function(sortfunction) {
		// collect the attributes
		var r = [];
		for (var depth in this.attributes) {
			for (var attribute in this.attributes[depth]) {
				r.push([depth, attribute, this.stringToNodes(this.attributes[depth][attribute]).length]);
			}
		}
		
		// sort them
		return r.sort(sortfunction);
	},
	/*
	 * Sorts the attributes according to the number of matches
	 */
	sortAttributes: function() {
		this.sortedAttributes = this.sortAttributes2(function(a,b) {
			return (b[2] - a[2]) // first sort by number of matches (descending) 
				|| (b[0] - a[0])  // then sort by xpath depth (descending)
				|| (b[1].length - a[1].length)  // then sort by attribute length (descending)
		});
		return this.sortedAttributes;
	},
	toString: function() {
		var result = "<table>";
		result += "<tr><th>Depth</th><th>Attribute</th><th>Nodes</th></tr>";
		
		for (var depth in this.attributes) {
			for (var attribute in this.attributes[depth]) {
				result += 
					"<tr><td>" + depth + 
					"</td><td>" + attribute + 
					"</td><td style='font-family: monospace'>" + this.attributes[depth][attribute] + 
					"</td></tr>";
			}
		}
		result += "</table>"

		return result;		
	}
}

// ------------------------- XpathBuilder -----------------------------------
// helps creating an xpath
SearchResultFinder.XpathBuilder = function(xpath) {
	this.predicates = [];
	this.parts = [];
	
	var index = -1;

	var inPredicate = 0;
	var buffer = '';
	for (var i = 0; i < xpath.length; i++) {
		var c = xpath[i];
		if (inPredicate <= 0) {
			if (c == '/' || c == '[') {
				if (buffer.length > 0) {
					this.parts.push(buffer);
					buffer = "";
				}
				if (c == '/') index++;
				else if (c == "[") inPredicate++;
			} else {
				buffer += c;
			}
		} else if (inPredicate == 1) {	
			if (c == ']') {
				inPredicate--;
				if (buffer.length > 0) {
					var props = buffer.split(" and ");
					for (var j in props) {
						this.addPredicate(index, props[j]);
					}
					buffer = "";
				}
			} else{ 
				if (c == "[") inPredicate++;
				buffer += c;
			}
		} else { // inPredicate > 1
			if (c == "[") inPredicate++;
			else if (c == ']') inPredicate--;
			buffer += c;
		}
	}
	if (buffer.length > 0) {
		if (inPredicate == 0) {
			this.parts.push(buffer);
		} else {
			var props = buffer.split(" and ");
			for (var j in props) {
				this.addPredicate(index, props[j]);
			}
		}
	}


	/*	// var re = /\/([^\[\/]*)(?:\[(.*?)\])?/g; // splits the xpath on intermediate slashes, taking into account predicates 
	 	var re = /\/([^\[\/]*)/g; // splits the xpath on intermediate slashes, not taking into account predicates 
		var index = 0;

		var curStart = 0;
		var prevEnd = 0;
		while (match = re.exec(xpath)) {
			this.parts.push(match[1]);
			var curStart = match.index;
			if (index > 0 && curStart != prevEnd) { // we missed the predicates
				var props = xpath.substring(prevEnd + 1, curStart-1).split(" and ");
				for (var i in props) {
					this.addPredicate(index, props[i]);
				}
			}
			prevEnd = re.lastIndex;
			index++;
		}
		if (prevEnd != xpath.length-1) { // we missed the predicates
			var props = xpath.substring(prevEnd + 1, xpath.length - 1).split(" and ");
			for (var i in props) {
				this.addPredicate(index - 1, props[i]);
			}
		}
	*/
}

SearchResultFinder.XpathBuilder.prototype = {
	parts: null, 
	predicates: null, // offset in parts -> list of properties
	addPredicate: function(index, prop) {
		if (!this.predicates[index])
			this.predicates[index] = [prop];
		else {
			this.predicates[index].push(prop);
		}
	},
	removePredicate: function(index, prop) {
		if (this.predicates[index]) {
			var i = this.predicates[index].indexOf(prop);
			if (i > -1) {
				delete this.predicates[index][i];
				if (SearchResultFinder.Helper.arrayLength(this.predicates[index]) == 0) {
					delete this.predicates[index];
				}
			}
		}
	},
	// iterates over the predicates at a particular depth
	// if depth == -1, all predicates are visited
	// predfunc is a predicate function with arguments (depth, predicate)
	visitPredicates: function(predfunc, depth) {
		if (depth > -1) {
			var p = this.predicates[depth]; 
			if (p) {
				for (var i in p) {
					predfunc(depth, p[i]);
				}
			}
		} else {
			for (var i = 0; i < this.parts.length; i++) {
				this.visitPredicates(predfunc, i);
			}
		}		
	},
	/**
	 * returns the final xpath
	 * optionally starting at a particular index
	 * 
	 * for instance
	 * new XpathBuilder(/html/body/div/p).toString(1) will return
	 * //body/div/p
	 */
	toString: function(start) {
		start = start || 0;
		var result = '';
		for (var i = start; i < this.parts.length; i++) {
			result += "/";
			result += this.parts[i];
			if (this.predicates[i]) {
				result += "[" + SearchResultFinder.Helper.arrayValues(this.predicates[i]).join(" and ") + "]";
			}
		}
		if (start > 0) {
			return "/" + result;
		} else return result;
	},
	/** 
	 * given xpath /html/body/div/p/a
	 * with level 1 returns
	 * /html/body/div/p
	 * with level 2 returns
	 * /html/body/div
	 * etc.
	 */
	reducedLevelString: function(level) {
		var result = '';
		for (var i = 0; i < this.parts.length - level; i++) {
			result += "/";
			result += this.parts[i];
			if (this.predicates[i]) {
				result += "[" + SearchResultFinder.Helper.arrayValues(this.predicates[i]).join(" and ") + "]";
			}
		}
		return result;
	},
	/**
	 * given xpath /html/body/div/p/a
	 * with level 1 returns
	 * /html/body/div/p[./a]
	 * with level 2 returns
	 * /html/body[./div/p/a]
	 * etc.
	 * level >= 0 and level < parts.length - 1
	 */
	levelUpString: function(level) {
		var result = '';
		level = Math.max(level, 0); // level >= 0
		var level2 = Math.max(this.parts.length - level, 0); // level < parts.length - 1
		var notLastLevel = level2 != this.parts.length - 1;
		
		for (var i = 0; i < this.parts.length; i++) {
			
			result += "/";
			
			result += this.parts[i];
			if (this.predicates[i]) {
				if (i == level2 && notLastLevel) {
					result += "[" + SearchResultFinder.Helper.arrayValues(this.predicates[i]).join(" and ") + " and .";
				} else {
					result += "[" + SearchResultFinder.Helper.arrayValues(this.predicates[i]).join(" and ") + "]";
				}
			} else {
				if (i == level2  && notLastLevel) result += "[.";
			}
			
			if (i == this.parts.length - 1 && notLastLevel) result += "]";
		}
		return result;
	},
	debugString: function() {
		var result = '';
		result += this.parts.length + " parts: " + this.parts + "\n";
		for (var i = 0; i < this.parts.length; i++) {
			if (this.predicates[i]) {
				result += i + " " + this.parts[i] + ": " + this.predicates[i] + "\n";
			} else {
				result += i + " " + this.parts[i] + ": none\n";
			}
		}
		result += "predicates:\n";
		for (var i in this.predicates) {
			result += "[" + i + "]" + this.predicates[i] + "\n";
		}
		
		result += this.toString() + "\n";
		return result.replace(/\n/g, "<br/>");
	}
}

// ------------------------- helper functions -----------------------------------

SearchResultFinder.Helper = {};

/* 
	returns an array of nodes matching the xpath in the given doc
	if the xpath is malformed (i.e. throws an exception), null is returned
	otherwise an array of matching nodes is returned (which can be empty)
*/
SearchResultFinder.Helper.getNodes = function(doc, xpath, contextnode) {
	contextnode = contextnode || doc;
	try {
		var nodes = doc.evaluate(xpath, contextnode, null, XPathResult.ANY_TYPE, null);
		var result = [];
		var node;
		while (node = nodes.iterateNext()) {
			result.push(node);
		}
		return result;
	} catch (exc) {
		return null;
		// FIXME remove
		// throw "No nodes found for " + xpath;
		// return null;
	}
}

SearchResultFinder.Helper.getWnodes = function(doc, xpath, contextnode) {
	return SearchResultFinder.Helper.createWrapperNodes(
		SearchResultFinder.Helper.getNodes(doc, xpath, contextnode)
	);
}



/*
	returns a simple xpath representatin of a node, consisting of the lowercased node names of the path to the root
	of the dom tree, e.g.
	/html/body/div/p
	No attributes are taken into account
*/
SearchResultFinder.Helper.getSimpleXpath = function(node) {
	if (node && node.nodeType == 1) {
		return SearchResultFinder.Helper.getSimpleXpath(node.parentNode) + "/" + node.localName.toLowerCase();;
	} else {
		return "";
	}
}

/*
	returns the name of a child relative to a parent.
	For instance, the child /html/body/div/p/a for parent /html/body
	returns ./div/p/a	 
*/
SearchResultFinder.Helper.nodeName = function(child, parent) {
	if (child == parent) return ".";
	else {
		return SearchResultFinder.Helper.nodeName(child.parentNode, parent) + "/" + child.localName.toLowerCase();
	}
}

/**
 * Returns the depth of a node
 * /html = 0
 * /html/body = 1
 * etc.
 */
SearchResultFinder.Helper.getDepth = function(node) {
	if (node && node.nodeType == 1) return SearchResultFinder.Helper.getDepth(node.parentNode) + 1;
	else return -1;
}

/**
 * Creates an array of WrapperNode objects for an array of dom nodes
 */
SearchResultFinder.Helper.createWrapperNodes = function(nodes) {
	var result = [];
	for (var i = 0; i < nodes.length; i++) {
		result.push(new SearchResultFinder.WrapperNode(nodes[i]));
	}
	return result;
}
/**
 * calculates the cosine between vectors
 */
SearchResultFinder.Helper.cosine = function(s1, s2) {
	var l1 = 0;
	var l2 = 0;
	var dot = 0;
	for (var i in s1) {
		l1 += s1[i] * s1[i];
		if (s2[i]) {
			dot += s1[i] * s2[i];
		}
	}
	for (var i in s2) {
		l2 += s2[i] * s2[i];
	}
	l1 = Math.sqrt(l1);
	l2 = Math.sqrt(l2);
	
	if (l1 > 0 && l2 > 0)
		return dot / (l1 * l2);
	else
		return 0;
}

/**
 * Returns all the ancestors of a list of nodes
 * returns a hashtable with node -> number of times encountered (a value between 1 and nodes.length)
 */
SearchResultFinder.Helper.getAncestors = function(nodes) {
	var ancestors = new Hashtable();
	for (var i = 0; i < nodes.length; i++) {
		var p = nodes[i];
		while (p != null && p.nodeType == 1) {
			if (!ancestors.containsKey(p)) ancestors.put(p, 1);
			else ancestors.put(p, ancestors.get(p) + 1);
			p = p.parentNode;
		}
	}
	return ancestors;
}

/**
 * returns the length of an array (the .length property gives the highest numeric value)
 */
SearchResultFinder.Helper.arrayLength = function(arr) {
	var l = 0;
	for (var v in arr) {
		l++;
	}
	return l;
}

/**
 * Simplifies an xpath by adding predicates for common ancestor nodes with ids
 * and searching for a relative xpath (starting with //) rather than a global xpath (starting with /)
 * 
 * If no simplification is possible, the orignal xpath is returned
 */
SearchResultFinder.Helper.simplifyXpath = function(doc, xpath) {
	var nodes =	SearchResultFinder.Helper.getNodes(doc, xpath);
	if (nodes == null) {
		// throw "No nodes found for " + xpath + " UNEXPECTED";
		return xpath;
	}
	var nodecount = nodes.length;

	// parses it into parts
	var xb = new SearchResultFinder.XpathBuilder(xpath);
	// add id information to single common nodes, i.e. a node which is a parent of all
	// the ancestors with count nodecount, are common nodes
	var common = [];
	SearchResultFinder.Helper.getAncestors(nodes).each(function (node, count) {
			if (count == nodecount) common.push(node);
		});
	
	// for these common nodes, add id information when available (and not already there)
	for (var i = 0; i < common.length; i++) {
		var node = common[i];
		if (node.id && typeof(node.id) != 'object') {
			var depth = SearchResultFinder.Helper.getDepth(node);
			
			var hasIdPredicate = false;
			var predfunc = function(depth, predicate) {
				if (predicate.indexOf("@id") > -1) {
					hasIdPredicate = true; 
				}
			}.bind(this);

			xb.visitPredicates(predfunc, depth);

			if (!hasIdPredicate) {
					xb.addPredicate(
						depth,
						"@id='" + node.id + "'"
					);		
			}
		}
	}
	xpath = xb.toString();
	
	for (var i = xb.parts.length - 1; i > 0; i--) {
		var shorterXpath = xb.toString(i);
		if (SearchResultFinder.Helper.getNodes(doc, shorterXpath).length == nodecount) {
			return shorterXpath;
		}
	}
	
	return xpath; // no simplification possible	
}

/*
returns the values in the array in a clean, integer-indexed array
*/
SearchResultFinder.Helper.arrayValues = function(array) {
	var result = [];
	for (var i in array) {
		result.push(array[i]);
	}
	return result;
}

// get the relative index of the node, when it has siblings with the same name
SearchResultFinder.Helper.getNodeIndex = function(node) {
	var count;
  	if (node.previousSibling) {
    	count = 1;
    	var sibling = node.previousSibling
    	do {
      		if (sibling.nodeType == 1 && sibling.localName == node.localName) count++;
      		sibling = sibling.previousSibling;
    	} while (sibling);
    	if (count == 1) count = null;
  	}	
  	if (count == null && node.nextSibling) {
    	var sibling = node.nextSibling;
    	do {
      		if(sibling.nodeType == 1 && sibling.localName == node.localName) {
        		count = 1;
        		sibling = null;
      		} else {
        		count = null;
        		sibling = sibling.nextSibling;
      		}
    	} while (sibling);
  	}
	return count;
}

/*
returns an xpath in the form
/html/body/div[2]/p[3]
uniquely identifying the node
*/
SearchResultFinder.Helper.getUniqueXpath = function(node) {
	if (node && node.nodeType == 1) {
		var count = SearchResultFinder.Helper.getNodeIndex(node);

	 	var strcount = '';
		if (count != null)
			strcount = "["+ count + "]";

		return SearchResultFinder.Helper.getUniqueXpath(node.parentNode) + "/" + 
			node.localName.toLowerCase() + strcount;
	} else {
		return "";
	}
}

/**
 * determines the width and height of a node based on its children
 */
SearchResultFinder.Helper.determineSizeByChildren = function(jqnode, returnWidth) {
	// determine pixel offset
	var o = jqnode.offset();
	if (o == null) return 0; 
	var min = returnWidth ? o.left : o.top;
	var max = min;
	
	jqnode.children().each(function(index, node){
		var n = jQuerySRF(node);
		var right = returnWidth ? 
			n.offset().left + n.outerWidth(): 
			n.offset().top + n.outerHeight(); 
		if (right > max) {
			max = right;
		}
	});

	return max - min;
}

/**
 * Returns true when bounding box a completely covers bounding box a 
 * has 1 px of slack
 */
SearchResultFinder.Helper.covers = function(a, b) {
	return a[0] <= b[0] + 1 && // top
		a[1] <= b[1] + 1 && // left
		a[2] >= b[2] - 1 && // bottom
		a[3] >= b[3] - 1; // right
}

SearchResultFinder.Helper.dump = function(obj) {
	var r = "";
	var c = 0;
	for (var i in obj) {
		r += i + "=" + obj[i] + "\n";
		c++;
	}
	if (c == 0)
		return obj;
	else return "{" + r + "}\n";
}

// returns a text representation of the node
// this includes
// alt text
// hyperlinks of images
SearchResultFinder.Helper.getNodeText = function(node) {
	return SearchResultFinder.Helper.htmlToText(node.innerHTML);
}

// tags which do not result in newline breaks
var nonbreakhtml = new Array("i", "a", "b", "em", "span");
// re for opening and closing tags of nonbreaking html tags
var nonbreakre = new RegExp("<\/?(" + nonbreakhtml.join("|") + ")(\\s.*?)?>", "gim");

// breaking html tags:
var breakhtml = new Array("div", "br", "p", "img", "tr", "li", "dd", "dt", "h\\d");
// re for __opening__ tags of nonbreaking html tags
var breakre = new RegExp("<(" + breakhtml.join("|") + ")\\s?.*?>", "gim");

// re for extracting alt text, href and src
var alttextattributes = new Array("title", "alt", "href", "src");

var alttextre = new RegExp("<[^>]*\\s[^>]*(?:" + alttextattributes.join("|") + ")=\"(.*?)\"[^>]*>", "gim");


/*
known issues:
1) cascading style sheets are not supported
e.g. <div style="display: inline"> -> this will result in a line break
2) closing p tags are not \n-ed
3) it does not decode html entities in attributes
e.g. <img alt="Nikon D7000 &lt;em&gt;Digital&lt;/em&gt; SLR &lt;em&gt;Camera&lt;/">
4) fails on incorrect html (attribute values should be properly encoded)
<... onmouseover="set_tip_width('Opens the search result anonymously<br>Great privacy feature - slightly slower','0');">

important note: does _not_ decode the html
*/
SearchResultFinder.Helper.htmlToText = function(html) {
	var str = html || "";
	
	// ignore all existing newlines, newlines will be based on encountered tags
	str = str.replace(/\n/g, " ");
	
	// replace images by their alt text
	str = str.replace(alttextre, " $1 ");
	
	// remove nonbreaking html tags 
	str = str.replace(nonbreakre, "");

	// add newlines for some tags
	str = str.replace(breakre, "\n");

	// replace remaining tags by whitespace
	str = str.replace(/<.*?>/gim, " ");
	
	// replace &nbsp; by whitespace
	str = str.replace(/&nbsp;/gi, " ");
	
	// remove unicode characters outisde ASCII range
	str = str.replace(/[^\n\r\u0020-\u007E]+/gm, " ");
	// str = str.replace(/[\u0080-\uFFFF]+/gm, "");

	// normalize whitespace
	str = str.replace(/[ \t\r]+/gm, " ");
	
	// normalize double newline breaks
	str = str.replace(/( *\n)+/gm, "\n"); 
	str = str.replace(/\n +/gm, "\n"); 
	
	// trim
	str = str.replace(/^\s+/gm, ""); 
	str = str.replace(/\s+$/gm, ""); 
			
	return str;
}

SearchResultFinder.Helper.nodesToSnippetsXml = function(id, doc, nodes, time, xpath1, xpaths) {
	var page = jQuerySRF("<page/>");
	page.attr("id", id);
	page.attr("time", time);
	page.attr("xpath", xpath1);
	
	for (var i = 0; i < xpaths.length; i++) {
		var xp = jQuerySRF("<xpath/>");
		xp.append(doc.createTextNode(xpaths[i]));
		page.append(xp);
	}
	
	for (var i = 0; i < nodes.length; i++) {
		var node = nodes[i];
		
		var srrRank = (i + 1);
		var srrXpath = SearchResultFinder.Helper.getUniqueXpath(node);
		var linknodes = SearchResultFinder.Helper.getNodes(doc, ".//a", node);
		var srrUrl = "";
		if (linknodes.length > 0)
			srrUrl = linknodes[0].href;
		var srrText = SearchResultFinder.Helper.getNodeText(node);

		var srr = jQuerySRF("<srr />");
		var r = jQuerySRF("<rank/>");
		r.append(doc.createTextNode(srrRank));
		srr.append(r);

		r = jQuerySRF("<xpath/>");
		r.append(doc.createTextNode(srrXpath));
		srr.append(r);
		
		r = jQuerySRF("<url/>");
		r.append(doc.createTextNode(srrUrl));
		srr.append(r);
		
		r = jQuerySRF("<text/>");
		r.append(doc.createTextNode(srrText));
		srr.append(r);

		page.append(srr);
	}
	var str = (new XMLSerializer()).serializeToString(page[0]);
	
	// remove namespace
	return str.replace(/\s*xmlns=\"[^\"]*?\"\s*/, " ");
}

/**
* Generate a nicer XPath by using the Nodes a XPath has generated
* Author: Han van der Veen
*/
SearchResultFinder.Nicer = function (wrapper) {
	
	this.wrapper = wrapper;
	this.DEBUG = false;
	this.max_level = 10;
	
	/**
	 * Parse the attributes of a certain node and get a node with the attributes
	 * @param node
	 * @returns {Array}
	 */
	function parseAttributes(node) {
		var node_ids = [node.nodeName.toLowerCase()];
		for(var i = 0, len = node.attributes.length; i < len; i++) {
			var attr = node.attributes[i];
			var n = node.nodeName.toLowerCase()+"[@"+attr.name+"='"+attr.nodeValue+"']";
			node_ids.push(n);
		}
		return node_ids;
	}
	
	/**
	* Child of a certain parent Node and ancestors
	* 
	* <ul class="result"> <li> ...</li> ...</ul>
	*
	* @return array
	* 
	* http://www.mediamarkt.nl/webapp/wcs/stores/servlet/MultiChannelSearch?storeId=10259&langId=-11&searchProfile=onlineshop&searchParams=&path=&query=tablet
	*/
	this.case1 = function (w) {
		var xpaths = [];
		var parent = w.nodes[0].parentNode;
		var _parent = parent;
		
		var child_name = w.nodes[0].nodeName.toLowerCase();
		
		var _level = 0;
		while(_parent.nodeName != 'HTML' && _level < this.max_level) {
			
			var nodes = parseAttributes(_parent);
			for(var i = 0; i < nodes.length; i++) {
				var path = '//'+nodes[i];
				var inner_path = '';
				
				// build path from parent of child to the current parent in the loop
				// only consider the nodeName in this path
				var child = parent;
				while(child != _parent) {
					inner_path = '/'+ child.nodeName.toLowerCase() + inner_path;
					child = child.parentNode;
				}
				xpaths.push(path + inner_path + '/'+child_name);
			}
			
			_level++;
			_parent = _parent.parentNode;
		}
		
		return xpaths;
	};
	
	/**
	* Node self is identified by attributes
	* <ul> 
	* 	<li class="result"> ... </li>
	* </ul>
	*
	* @return array
	* 
	* http://azerty.nl/producten/zoek/?scope=artikelen&ZOEKTERMEN=intel+i7&zoek=+
	* http://www.ebay.com/sch/i.html?_trksid=p5360.m570.l1313.TR0.TRC0.H0.Xnokia&_nkw=nokia&_sacat=0&_from=R40
	*/
	this.case2 = function (w, contains) {
		var xpaths = [];
		var nodes = w.nodes;
		var attributes = [];
		
		var node = nodes[0];
		for(var j = 0, attr_len = node.attributes.length; j < attr_len; j++) {
			var n = node.attributes[j].name;
			if(contains) {
				node.attributes[j].nodeValue.split(' ').forEach(function (v) {
					attributes.push({
						name : n,
						value : v
					});
				});
			} else {
				attributes.push({
					name : n,
					value : node.attributes[j].nodeValue
				});
			}
			
		}
	
		
		for(var attr_key in attributes) {
			
			var attr = attributes[attr_key];
			
			if(this.theSameAttribute(nodes, attr.name, attr.value, contains)) {
				if(contains)
					xpaths.push('//'+nodes[0].nodeName.toLowerCase()+'[contains(@'+attr.name+',"'+attr.value+'")]');
				else
					xpaths.push('//'+nodes[0].nodeName.toLowerCase()+'[@'+attr.name+'="'+attr.value+'"]');
			}			
			
		}
		
		return xpaths;
	};
	
	/**
	 * Checks wheter on all nodes the callback is true
	 * @param function callback check callback must return true or false
	 * @return boolean
	 */
	this.theSame = function (nodes, callback) {
		
		var result = true;
		
		for(var i = 0, len = nodes.length; result && i < len; i++) {
			if(!callback(nodes[i])) {
				result = false;
			}
		}
		
		return result;
	};
	
	/**
	 * Uses the function the same this function is like a forAll with a callback that must be true
	 */
	this.theSameAttribute = function (nodes, attribute, value, contains) {
		
		return this.theSame(nodes, function (node) {
			var result = false;
			
			for(var i = 0, len = node.attributes.length; !result && i < len; i++) {
				var v = node.attributes[i].nodeValue;
				var match = contains ? v.split(' ').indexOf(value) !== -1 : v === value;  
				if(node.attributes[i].name === attribute && match) {
					result = true;
				}
			}
			
			return result;
		});
	};
	
	/**
	* Child structure is the identifier
	*
	* <li> <h3><a>test</a></h3> </li>
	*
	* @return array
	*/
	this.case3 = function (w) {
		// going to search for h[0-9] and a
		var xpaths = [];
		
		// assuming that the structure of all nodes are sort of the same
		
		var structures = [];
		var node = jQuerySRF(w.nodes[0]);
		
		// searching for <h3><a> and <a><h3>
		var els = node.find('h1, h2, h3, h4, h5, h6, a');
		
		for(var j = 0; j < els.length; j++) {
			var el = jQuerySRF(els[j]);
			
			// h3 > a
			if(el.find('> a').length == 1) {
				structures.push('//'+el[0].nodeName.toLowerCase()+'/a');
			// a > h3
			} else if(el.parent().is('a')) {
				structures.push('//a/'+el[0].nodeName.toLowerCase());
			} 
			
			// complete path to h3
			var path = '';
			var p = el[0];
			while(p !== w.nodes[0]) {
				path = p.nodeName.toLowerCase()+'/'+path;
				p = p.parentNode;
			}
			structures.push('/'+path.substring(0, path.length - 1));
		};
		
		for(var i = 0; i < structures.length; i++) {
			var struct = structures[i];
			xpaths.push('//'+w.nodes[0].nodeName.toLowerCase()+'[.'+struct+']');
		}
		
		return xpaths;
	};
	
	// parent en identified child
	// http://www.bestbuy4you.nl/search/?q={q}
	this.case4 = function (w) {
		
		var c1 = this.case1(w);
		var c2 = this.case2(w).concat(this.case2(w, true));
		var xpaths = [];
		
		for(var i = 0; i < c1.length; i++) {
			for(var j = 0; j < c2.length; j++) {
				var xpath = c1[i].split('/').slice(0, -1).join('/')+'/'+c2[j].substring(2);
				xpaths.push(xpath);
			}
		}
		return xpaths;
	};
		
	// parent en identified on children structure
	this.case5 = function (w) {
		var c1 = this.case1(w);
		var c3 = this.case3(w);
		var xpaths = [];
		
		for(var i = 0; i < c1.length; i++) {
			for(var j = 0; j < c3.length; j++) {
				var xpath = c1[i].split('/').slice(0, -1).join('/')+'/'+c3[j].substring(2);
				xpaths.push(xpath);
			}
		}
		return xpaths; 
	};
};
/**
 * Get a nicer XPath
 * 
 * @return string
 */
SearchResultFinder.Nicer.prototype.getNicerXPath = function () {
	var paths = [this.wrapper.xpath];
	paths = paths.concat(this.case1(this.wrapper, 1));
	paths = paths.concat(this.case2(this.wrapper));
	paths = paths.concat(this.case2(this.wrapper, true));		
	paths = paths.concat(this.case3(this.wrapper));	
	paths = paths.concat(this.case4(this.wrapper));	
	paths = paths.concat(this.case5(this.wrapper));	
	if(this.DEBUG) 
		console.log('potential matches', paths);
	
	var correct_xpaths = [];
	// check xpaths
	for(var i = 0; i < paths.length; i++) {
		var xpath = paths[i];
		// check if results are the same for an xpath
		var result = SearchResultFinder.Helper.getNodes(document, xpath);
		if(result != null && this.wrapper.nodes.length === result.length && this.wrapper.nodes[0] == result[0] && this.wrapper.nodes[this.wrapper.nodes.length - 1] == result[result.length -1]) {
			correct_xpaths.push({
				xpath : xpath,
				data : this.score(xpath)
			});
		} else {
			if(this.DEBUG) 
				console.log('wrong xpath: '+xpath);
		}
	}	
	
	var max_vector = [0,0,0,0,0];
	for(var i = 0; i < correct_xpaths.length; i++) {
		for(var j = 0; j < max_vector.length; j++) {
			if(max_vector[j] < correct_xpaths[i].data[j]) {
				max_vector[j] = correct_xpaths[i].data[j];
			}
		}
	}
	
	for(var i = 0; i < correct_xpaths.length; i++) {
		var d = correct_xpaths[i].data;
		
		for(var j = 0; j < max_vector.length; j++) {
			if(max_vector[j] > 0)
				d[j] = d[j] / max_vector[j];
		}
		
		d[0] = 1 - d[0];
		d[3] = 1 - d[3];
		d[4] = 1 - d[4];
		
		d[0] *= 1.3; // weights
		d[3] *= 1.2;
		
		correct_xpaths[i].score = Math.sqrt(d.map(function (a) {
			return a * a;
		}).reduce(function (a,b) {
			return a + b;
		}));
	}
	
	correct_xpaths.sort(function (a, b) {
		return a.score < b.score ? 1 : -1;
	});
	
	// top 5
	var str = "";
	correct_xpaths.slice(0, 25).forEach(function (v) {
		str += v.xpath + ' ('+Math.round(v.score*100)/100+')'+"\n";
	});
	alert(str);
};

/**
 * Apply guidelines to an XPath and give a score of niceness.
 * @param xpath
 * @returns {Array} score of an Xpath
 */
SearchResultFinder.Nicer.prototype.score = function (xpath) {
	
	// Guideline: less steps is better
	// max 10
	var steps = 0;
	var sub_steps = 0;
	(function () {
		var brackets = 0;
		for(var i = 0; i < xpath.length; i++) {
			var char = xpath.charAt(i);
			if(char == '[') brackets++;
			if(char == ']') brackets--;
			if(char == '/') {
				if(brackets == 0) {
					steps++;
				} else {
					sub_steps++;
				}
			} 
		}
	})();
		
	// Guideline: @class and @itemprop are better
	// max = 3
	var properties = 0;	
	if(xpath.indexOf('@') > -1) properties++;
	
	// Guideline: some words are in it, are better => self describtive
	// max = 5
	var matching_words = ['result','item','product','list','offer', 'article', 'lijst'];
	var words = 0;
	matching_words.forEach(function (w) {
		if(xpath.toLowerCase().indexOf(w) > -1) 
			words++;
	});
	
	return [xpath.length, properties, words > 0 ? 1 : 0, steps, sub_steps];
};