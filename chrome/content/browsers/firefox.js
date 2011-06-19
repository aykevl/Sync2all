
var fx = {
	shortname: 'fx',
	name: 'Mozilla Firefox',

	start: function () {
		setTimeout(this.getBookmarks, 100);
	},

	getBookmarks: function () {
		// https://developer.mozilla.org/en/Retrieving_part_of_the_bookmarks_tree
		var historyService = Components.classes["@mozilla.org/browser/nav-history-service;1"]
											 .getService(Components.interfaces.nsINavHistoryService);
		var options = historyService.getNewQueryOptions();
		var query = historyService.getNewQuery();

		var bookmarksService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"]
											   .getService(Components.interfaces.nsINavBookmarksService);
		var toolbarFolder = bookmarksService.toolbarFolder;

		query.setFolders([toolbarFolder], 1);

		var result = historyService.executeQuery(query, options);
		var rootNode = result.root;
		rootNode.containerOpen = true;

		// iterate over the immediate children of this folder and dump to console
		for (var i = 0; i < rootNode.childCount; i ++) {
			var node = rootNode.getChild(i);
			dump("Child: " + node.title + "\n");
		}

		 // close a container after using it!
		 rootNode.containerOpen = false;
	},
}

use_target(fx);
