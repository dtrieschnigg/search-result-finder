/*
* Author: Dolf Trieschnigg
* $Id: searchresultfindergui.js 33 2013-07-19 07:39:45Z trieschn $
* $Revision: 33 $
* $Date: 2013-07-19 09:39:45 +0200 (Fri, 19 Jul 2013) $
*/

// requires	
// searchresultfinder.js and all its dependencies

if (!SearchResultFinder) {
	SearchResultFinder = {}
}

SearchResultFinder.Gui = {};

SearchResultFinder.Gui = function(document) {
	this.doc = document;
	this.finder = null;
	this.dialog = null;
}

SearchResultFinder.Gui.prototype = {
	doc: null,
	finder: null,
	dialog: null,
	run: function() {
		var doc = this.doc;
		var log, wrappers;

		log = "";
		this.finder = new SearchResultFinder.Finder(this.doc);
		this.finder.log = function(message) {
			log += message + "<br/>";
		};
		this.finder.find();
		wrappers = this.finder.wrappers;
	
		// find or create the search result finder dialog
		this.dialog = new SearchResultFinder.Gui.Dialog(doc);
		this.dialog.setWrappers(wrappers);		
		this.dialog.setLog(log);
		this.dialog.show();
	}
}

SearchResultFinder.Gui.Dialog = function(doc) {
	this.doc = doc;
	this.findOrCreateDialog();
}

SearchResultFinder.Gui.Dialog.prototype = {
	doc: null,
	dialog: null, // node element
	show: function() {
		this.dialog.dialog('open');
	},
	setWrappers: function (wrappers) {
		var tab = jQuerySRF("#srf_tabxpaths", this.doc);
		tab.empty();

		var checkBoxFunction = function() {
			this['highlighter'].toggle();
		};

		var table = jQuerySRF('<table id="srf_xpathtable" />', this.doc);
		// // add header row
		table.append("<tr><th></th><th>Xpath</th><th>Nodes</th><th>Area</th><th>Min</th><th>Avg</th><th>grid</th></tr>"); 

		var row = jQuerySRF("<tr/>", this.doc);
		var cell = jQuerySRF("<td/>", this.doc);
		var checkbox = jQuerySRF("<input type='checkbox'/>", this.doc);
		cell.append(checkbox);
		row.append(cell);
		cell = jQuerySRF("<td/>", this.doc);
		var manualinput = jQuerySRF("<input type='text' style='width: 90%;'/>", this.doc);
		cell.append(manualinput);
		row.append(cell);
		row.append("<td id='srf_manual_length'></td>");
		row.append("<td>-</td>");
		row.append("<td>-</td>");
		row.append("<td>-</td>");
		row.append("<td>-</td>");
		table.append(row);
		checkbox.click(checkBoxFunction);
		checkbox[0]['highlighter'] = new SearchResultFinder.Gui.NodesHighlighter(this.doc, [], row);
		manualinput[0]['highlighter'] = checkbox[0]['highlighter'];
		var manualInputChange = function() {
			var nodes = SearchResultFinder.Helper.getNodes(document, jQuerySRF(this).val());
			if (nodes == null) {
				nodes = []; // TODO: indicate xpath is incorrect
				jQuerySRF(this).css("background-color", "#F78181");
			} else {
				jQuerySRF(this).css("background-color", "");
			}
			jQuerySRF('#srf_manual_length').text(nodes.length).dblclick(function () {
				var nicer = new SearchResultFinder.Nicer({nodes:nodes});
				nicer.getNicerXPath();
			});
			this['highlighter'].setNodes(nodes); 
		};
		manualinput.change(manualInputChange);

		jQuerySRF('#srf_manual_length').dblclick(function () {
			var nicer = new SearchResultFinder.Nicer({nodes : $(this)[0].highlighter.getNodes() });
			nicer.getNicerXPath();
		});
		
		var nodesClick = function() {
			// alert("nodes click");
			var str = "";
			var w = this['wrapper'];

			str += "Alternative xpaths:\n";
			for (var i in w.alternativeXpaths) {
				str += w.alternativeXpaths[i] + "\n";
			}
			str += "\n";
			str += "Unique xpaths:\n";

			for (var i = 0; i < w.nodes.length; i++) {
				str += SearchResultFinder.Helper.getUniqueXpath(w.nodes[i]) + "\n";
			}
			
			alert(str);
		}

		var alternativeXPath = function () {
			var w = this['wrapper'];
			
			var nicer = new SearchResultFinder.Nicer(w);
			nicer.getNicerXPath();
		};
		
		if (wrappers.length > 0) {
			for (var i in wrappers) {
				var w = wrappers[i];
				var row = jQuerySRF("<tr/>", this.doc);
				var cell = jQuerySRF("<td/>", this.doc);
				var input = jQuerySRF("<input type='checkbox'/>", this.doc);
				cell.append(input);
				row.append(cell);
				
				var xpath = jQuerySRF("<td nowrap><span>" + w.xpath + "</span></td>");
				var xpath_span = xpath.find('span');
				xpath_span[0].wrapper = w;
				xpath_span.click(alternativeXPath);
				
				row.append(xpath);
				
				var cell = jQuerySRF("<td/>", this.doc);
				var span = jQuerySRF("<span>", this.doc);
				// span.css("text-decoration", "underline");
				span[0].wrapper = w;
				span.dblclick(nodesClick);
				span.text(w.nodes.length);
				cell.append(span);
				row.append(cell);
				// row.append("<td>" + w.wnodes.length + "</td>");
				row.append("<td style='text-align: right'>" + Math.floor(w.area) + "</td>");
				row.append("<td>" + w.minSimilarity.toFixed(2) + "</td>");
				row.append("<td>" + w.avgSimilarity.toFixed(2) + "</td>");
				row.append("<td>" + w.grid[0] + "x" + w.grid[1] + "</td>");
				table.append(row);
			
				// note: use [0] to change the actual DOM node and not the wrapping jquery no=de
				input[0]['highlighter'] = new SearchResultFinder.Gui.NodesHighlighter(this.doc, w.nodes, row);
				input.click(checkBoxFunction);
			}
		} else {
			var row = jQuerySRF("<tr/>", this.doc);
			row.append("<td colspan='7'>No search results found on this page</td>");
			table.append(row);
		}
		tab.append(table);			
	},
	setLog: function (log) { // note that the log is in HTML
		jQuerySRF("#srf_tablog", this.doc).html(log);
	},
	onDialogClose: function() {
		// remove all active highlights
		jQuerySRF("#srf_xpathtable input:checked").each(function(id, elem) {
			elem['highlighter'].remove();
		});
	},
	findOrCreateDialog: function() {
		var r = jQuerySRF("#srf_dialog", this.doc);
		if (r.length) {
			this.dialog = r;
			return r;
		} else {
			jQuerySRF("body", this.doc).append(
'<div id="srf_dialog" title="Search Result Finder">' +
'	<div id="srf_tabs">' +
'		<ul>' +
'			<li><a href="#srf_tabxpaths">Xpaths</a></li>' +
'			<li><a href="#srf_tablog">Log</a></li>' +
'		</ul>' +
'		<div id="srf_tabxpaths" class="srf_tab">' +
'		</div>' +
'		<div id="srf_tablog" class="srf_tab">' +
'		</div>' +
'	</div>' +
'</div>'
			);

			jQuerySRF("#srf_dialog", this.doc).dialog({
					autoOpen: true,
					modal: false, 
					resizable: true, 
					draggable: true, 
					position: ['right','top'],
					height: "500",
					width: "700",
					zIndex: 2147483647, // the maximum possible ;-),
					close: this.onDialogClose
			});

			jQuerySRF( "#srf_tabs", this.doc).tabs();
			this.dialog = jQuerySRF("#srf_dialog", this.doc);
			
			return this.dialog;
		}
	}
}

// ------------------------- NodesHighlighter -----------------------------------

SearchResultFinder.Gui.NodesHighlighter = function(document, nodes, row) {
	this.document = document;
	this.nodes = nodes;
	this.row = row;
	this.active = false;
	this.uniquename = "srf_nh" + Math.floor(Math.random()* 1000000); // FIXME: a bit ugly ;-)
	this.label = true;
	this.style = {
		position: "absolute", 
		zIndex: 900, 
		background: this.randomColor()
	};
}

// TODO: add handling of resizes in the document
SearchResultFinder.Gui.NodesHighlighter.prototype = {
	document: null,
	nodes: [],
	row: null,
	active: false,
	uniquename: null,
	label: true,
	style: null,
	// adds the highlight to the document
	add: function() {
		if (!this.active) {
			// for each node, create an overlay and add it to the body
			for (var i = 0; i < this.nodes.length; i++) {
				var el = this.nodes[i];
			
				var box = jQuerySRF("<div class='"+ this.uniquename + " srf_highlightnode' />", this.document).css(this.style);
				
				var wn = new SearchResultFinder.WrapperNode(el);
				//el = $(el,this.document);
				// var offset = el.offset();
				box.css({
					width:  wn.getRight() - wn.getLeft(), 
					height: wn.getBottom() - wn.getTop(), 
					left:   wn.getLeft(), 
					top:    wn.getTop(),
					// width:  el.outerWidth()  - 1, 
					// height: el.outerHeight() - 1, 
					// left:   offset.left, 
					// top:    offset.top,
				});
				if (this.label) {
					box.append(jQuerySRF("<span>" + "#" + (i+1) +"</span>", this.document));
				}

				jQuerySRF("body", this.document).append(box);
			}
			
			this.row.css("background", this.style.background);
		
			this.active = true;
		}
	},
	setNodes: function(nodes) {
		var wasActive = this.active; // remember state
		this.remove();
		this.nodes = nodes;
		if (wasActive) this.add();
	},
	// removes the boxes which present the highlight
	remove: function() {
		if (this.active) {
			jQuerySRF('.' + this.uniquename, this.document).remove();
			
			this.row.css("background", "");

			this.active = false;
		}
	},
	toggle: function() {
		if (this.active) {
			this.remove();
		} else {
			this.add();
			// scroll to first item
			if (this.nodes.length > 0 && this.nodes[0].scrollIntoView) {
				this.nodes[0].scrollIntoView();
			}
		}
	},
	// scroll the selection into view
	scroll: function() {
		if (this.active && this.nodes.length > 0) {
			this.nodes[0].scrollIntoView();
		}
	},
	// returns a random html color
 	randomColor: function() {
		// rgba(0, 255, 0, .5)
		var result = "rgba(";
		for (var i = 0; i < 3; i++) {
			result += Math.floor(Math.random()*256);
			result += ",";
		}
		result += ".5"; // hard coded transparency, ugly...
		result += ")";
		return result;
	},
	toString: function() {
		return "NodesHighlighter[" + this.nodes.length + " nodes]";
	},
};