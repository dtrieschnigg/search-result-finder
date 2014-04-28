var searchresultfinder = function () {
	var prefManager = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	return {
		init : function () {
			/*
			gBrowser.addEventListener("load", function () {
				var autoRun = prefManager.getBoolPref("extensions.searchresultfinder.autorun");
				if (autoRun) {
					searchresultfinder.run();
				}
			}, false);
			*/
		},

		run : function () {
			var doc = content.document;
			if (document.popupNode) { // when we are in a frame
				doc = document.popupNode.ownerDocument;
			} 
			
			// add the required javascript to the document
			if (!doc.srf) {
				doc.srf = true;
			
				var head = doc.getElementsByTagName("head")[0];

				// add the style-sheet for highlighted boxes
				var styles = ["searchresultfinder.css", "gui/jquery-ui-1.8.12.custom.css"];
				for (var i in styles) {
					var style = doc.createElement("link");
					style.type = "text/css";
					style.rel = "stylesheet";
					style.href = "chrome://searchresultfinder/content/SearchResultFinder/" + styles[i];
					head.appendChild(style);
				}

				// add the javascript for the dynamic js loading
				var script = doc.createElement("script");
				script.type = "text/javascript";
				script.src = "chrome://searchresultfinder/content/SearchResultFinder/LAB.js";
				head.appendChild(script);
				
				var scriptSrc = "function startSRF() {\
						new SearchResultFinder.Gui(document).run(); \
					} \
					f = function() { \
						if (window.$LAB) { \
$LAB \
  .script('chrome://searchresultfinder/content/SearchResultFinder/jquery.js') \
  .script('chrome://searchresultfinder/content/SearchResultFinder/jshashtable-2.1.js').wait() \
  .script('chrome://searchresultfinder/content/SearchResultFinder/searchresultfinder.js') \
  .script('chrome://searchresultfinder/content/SearchResultFinder/gui/jquery-ui-1.8.12.custom.min.js').wait() \
  .script('chrome://searchresultfinder/content/SearchResultFinder/searchresultfindergui.js').wait(startSRF); \
} else {setTimeout(f, 50); } \
					}; \
					f(); \
";

				var script = doc.createElement("script");
				script.type = "text/javascript";
				scriptText = document.createTextNode(scriptSrc);
				script.appendChild(scriptText);
				head.appendChild(script);

			} else {
				content.location = "javascript:" + encodeURIComponent("startSRF()");	
			}

			
		}
	};
}()
window.addEventListener("load", searchresultfinder.init, false);