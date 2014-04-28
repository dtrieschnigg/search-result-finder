# SearchResultFinder

SearchResultFinder is a Firefox plugin to automatically determine XPaths to extract items from a search result page. Given a single search result page (i.e. the search result page you are browsing), the plugin suggests a number of candidate XPaths which you can visually inspect. The XPath can be used to extract items from result pages with the same template.

For more info see http://dolf.trieschnigg.nl/srf/

## Repository contents

The repository consists of two folders:
* ffplugin - code for the FireFox plugin, the "core" SearchResultFinder files are symbolically linked to jscore files
* jscore - code with the core components of SearchResultFinder