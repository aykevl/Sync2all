
var fx = {
	shortname: 'fx',
	name: 'Mozilla Firefox',

	init: function () {
		fx.historyService = Components.classes["@mozilla.org/browser/nav-history-service;1"]
		                              .getService(Components.interfaces.nsINavHistoryService);
		fx.bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"]
		                     .getService(Components.interfaces.nsINavBookmarksService);
		fx.ios = Components.classes["@mozilla.org/network/io-service;1"]
		                    .getService(Components.interfaces.nsIIOService);
	},

	start: function () {
		fx.bookmarks = {bm: {}, f: {}, id: fx.bmsvc.bookmarksMenuFolder};
		fx.ids = {};
		fx.ids[fx.bookmarks.id] = fx.bookmarks;
		fx.getTree();

		// add myself as observer
		fx.bmsvc.addObserver(fx, false);

		target_finished(fx);
	},

	stop: function () {
		// remove myself as observer when I don't need to know the changes
		fx.bmsvc.removeObserver(fx);
	},

	getTree: function () {
		fx.getSubTree(fx.bookmarks);
	},
	
	getSubTree: function (folder) {
		// https://developer.mozilla.org/en/Retrieving_part_of_the_bookmarks_tree
		var options = fx.historyService.getNewQueryOptions();
		var query = fx.historyService.getNewQuery();

		query.setFolders([folder.id], 1);

		var result = fx.historyService.executeQuery(query, options);
		var fx_folder = result.root;

		// open the folder first
		fx_folder.containerOpen = true;

		// iterate over the immediate children of this folder
		for (var i=0; i<fx_folder.childCount; i++) {
			var node = fx_folder.getChild(i);
			if (node.type == node.RESULT_TYPE_FOLDER) {
				if (folder.f[node.title]) {
					// duplicate
					// TODO move contents to old folder
					continue;
				}
				var subfolder = {title: node.title, id: node.itemId,
					bm: {}, f: {}, parentNode: folder};
				folder.f[subfolder.title] = subfolder;
				fx.ids[subfolder.id] = subfolder;
				fx.getSubTree(subfolder);
			} else if (node.type == node.RESULT_TYPE_URI) {
				if (folder.bm[node.uri]) {
					// duplicate
					fx.bmsvc.removeItem(node.itemId);
					continue;
				}
				var bm = {title: node.title, id: node.itemId, url: node.uri, parentNode: folder};
				folder.bm[node.uri] = bm;
				fx.ids[bm.id] = bm;
			}
		}

		// close a container after using it!
		fx_folder.containerOpen = false;
	},

	// Observer notifications

	onItemRemoved: function (id) {
		if (!fx.ids[id]) return;
		var node = fx.ids[id];
		delete fx.ids[id];
		rmNode(fx, node);
		commit();
	},
	onBeginUpdateBatch: function () {
		fx.update_batch = true;
	},
	onEndUpdateBatch: function () {
		fx.update_batch = false;
	},
	onBeforeItemRemoved: function (){},
	onItemChanged:       function (){},
	onItemAdded:         function (id, parentId, index, type, uri, title) {
		if (!title) {
			// gecko < 6
			title = fx.bmsvc.getItemTitle(id);
		}
		if (!fx.ids[parentId]) return; // not here added
		if (type == fx.bmsvc.TYPE_BOOKMARK) {
			var url = uri.resolve('');
			console.log('url: '+url);
			var bm = {url: url, title: title, id: id, parentNode: fx.ids[parentId]};
			fx.ids[bm.id] = bm;
			addBookmark(fx, bm);
		} else if (type == fx.bmsvc.TYPE_FOLDER) {
			var folder = {title: title, bm: {}, f: {},
				parentNode: fx.ids[parentId], id: id};
			fx.ids[folder.id] = folder;
			addFolder(fx, folder);
		}
		commit();
	},
	onItemChanged: function (id, property, is_annotation, newValue) {
		if (!fx.ids[id]) return; // not our item
		if (!property) return;
		console.log(fx.ids[id].title+' changed property '+property+' to '+newValue);
	},
	onItemMoved: function (id, oldParentId, oldIndex, newParentId, newIndex, type) {
		console.log('onItemMoved');

		move_event(fx, id, oldParentId, newParentId);

		/*// get objects
		var node = fx.ids[id];
		var oldParent = fx.ids[oldParentId];
		var newParent = fx.ids[newParentId];

		if (!fx.ids[newParent]) {
			// new parent is not known, should possibly be removed. TODO

		} else {
			if (!fx.ids[id]) {
				// moved to a synchronized folder
				if (type == fx.bmsvc.TYPE_BOOKMARK) {
					console.log('fx: bookmark moved into synchronized tree');
					var url = fx.fix_fx_url(fx.bmsvc.getBookmarkURI(id).resolve(null));
					var bm = {title: fx.bmsvc.getItemTitle(id), url: url, 
						parentNode: fx.ids[newParent], id: id};
					fx.ids[bm.id] = bm;
					addBookmark(fx, bm);
				} else if (type == fx.bmsvc.TYPE_FOLDER) {
					console.log('fx: folder moved into synchronized tree');
					var folder = {title: fx.bmsvc.getItemTitle(id),
						bm: {}, f: {}, parentNode: fx.ids[oldParent], id: id};
					// FIXME childs...
					fx.ids[folder.id] = folder;
					addFolder(fx, folder);
				}
			} else {
				// the item is moved inside the synchronized tree
				if (!fx.ids[oldParent]) {
					// shouldn't happen. This means that the item but not the parent is synchronized.
					console.error('Error: ...');
				}
			}
		}
		commit();*/
	},
	onItemReplaced: function () {
		// TODO
	},
	onItemVisited: function () {},
	
	// functions so other links can post changes to here

	f_add: function (link, folder) {
		folder.id = fx.bmsvc.createFolder(folder.parentNode.id, folder.title, fx.bmsvc.DEFAULT_INDEX)
		fx.ids[folder.id] = folder;
	},

	bm_add: function (link, bm) {
		var url = bm.url;
		if (url.substr(0, 9) == 'chrome://') {
			// newURI() doesn't like chrome URIs
			return; // FIXME handle this
			url = '_'+url;
		}
		try {
			var uri = fx.ios.newURI(bm.url, null, null);
		} catch (err) {
			// invalid URI
			console.error(err);
			return;
		}
		bm.id = fx.bmsvc.insertBookmark(bm.parentNode.id, uri, fx.bmsvc.DEFAULT_INDEX, bm.title);
		fx.ids[bm.id] = bm;
	},
	bm_del: function (link, bm) {
		delete fx.ids[bm.id];
		fx.bmsvc.removeItem(bm.id);
	},
	commit: function () {
		// TODO place more things in the queue to speed things up
		fx.queue_start(); // FIXME do in batch, see below
		//fx.bmsvc.runInBatchMode(fx.queue_start, {value: 'none'}); // FIXME doesn't work
	},
	finished_sync: false,

	// fix custom chrome:// uri's
	fix_fx_uri: function (uri) {
		if (uri.substr(0, 10) == '_chrome://') {
			return uri.substr(1);
		}
		return uri;
	},

	import_node: function (id) {
		// get the node type
		var type = fx.bmsvc.getItemType(id);

		if (type == fx.bmsvc.TYPE_BOOKMARK) {
			console.log('fx: bookmark moved into synchronized tree');
			var url = fx.fix_fx_url(fx.bmsvc.getBookmarkURI(id).resolve(null));
			var bm = {title: fx.bmsvc.getItemTitle(id), url: url, 
				parentNode: fx.ids[newParent], id: id};
			fx.ids[bm.id] = bm;
			addBookmark(fx, bm);
		} else if (type == fx.bmsvc.TYPE_FOLDER) {
			console.log('fx: folder moved into synchronized tree');
			var folder = {title: fx.bmsvc.getItemTitle(id),
				bm: {}, f: {}, parentNode: fx.ids[oldParent], id: id};
			// FIXME childs...
			fx.ids[folder.id] = folder;
			addFolder(fx, folder);
		}
	}
}

use_target(fx);
use_queue(fx);
