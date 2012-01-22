'use strict';

function BrowserBase() {
	TreeBasedLink.call(this);
}
BrowserBase.prototype.__proto__ = TreeBasedLink.prototype;

// To call when a bookmark node has been added. The node may be a modified
// object got with the event.
BrowserBase.prototype.onCreated = function (node) {
	var parentNode = sync2all.bookmarks.ids[node.parentId];
	if (!parentNode) return; // not in the synced folder

	if (node.id in sync2all.bookmarks.ids) return; // already tracked

	// check whether they already exist
	if (parentNode.bm[node.url]  && !parentNode.bm[node.url].id ||
	    parentNode.f[node.title] && !parentNode.f[node.title].id) {
		console.log('created by me.');
		return;
	}

	if (node.url) {
		// bookmark
		var bookmark = parentNode.newBookmark(this, node);
		console.log('Created new bookmark: '+node.url, bookmark);
	} else {
		// folder
		var folder = parentNode.newFolder(this, node);
		console.log('Created new empty folder: '+node.title, folder);
	}

	sync2all.commit();
};

/** Called when something has been moved.
 */
BrowserBase.prototype.onMoved = function (id, newParentId, oldParentId) {
	// get info
	var node      = this.ids[id];
	var oldParent = this.ids[oldParentId];
	var newParent = this.ids[newParentId];



	// if node is moved to outside synced folder
	if (!newParent) {
		// if the node comes from outside the synced folder
		if (!oldParent) {
			if (!node) {
				console.log('Bookmark/folder outside synchronized folder moved. Ignoring.');
			} else {
				console.log('BUG: only the node is known, not the rest \
						(including the parent!)');
			}
		} else { // the 'else' is not really needed
			if (!node) {
				console.log('BUG: only the old parent is known, not the node \
						nor the new parent');
			} else {
				// newParent is not known, node and oldParent are known.
				console.log('Move: new parent not found. Thus this bookmark/folder is \
						moved to outside the synced folder.');

				// remove the node
				node.remove(this);
				sync2all.commit()
			}
		}
	} else {
		// the node is moved to inside the synced folder
		if (!node) {
			// the node is moved from outside the synced folder to therein.
			if (!oldParent) { // check it twice, should also be undefined.

				console.log('Move: node id and oldParent not found. I assume this \
bookmark comes from outside the synchronized tree. So doing a crete now');
				this.import_node(id);
				sync2all.commit();
			} else {
				console.log('BUG: the node is not known, but the old parent \
						and the new parent are.');
			}
		} else {
			if (!oldParent) {
				// if the bookmark has been moved by Sync2all, ignore this event
				if (node.parentNode == newParent) {
					console.log('Move: the node has been moved by this extension, so doing nothing now.');
				} else {
					console.log('BUG: only the old parent is not known. The node \
							and the new parent are.');
				}
			} else {
				// the bookmark/folder has been moved within the synced folder tree.

				if (newParent == oldParent) {
					// when the bookmark has been moved inside a folder
					console.log('Move: newParent and oldParent are the same, so nothing moved.');
				} else {
					node.moveTo(this, newParent);

					sync2all.commit();
				}
			}
		}
	}
}

BrowserBase.prototype.onChanged = function (id, changeInfo) {
	console.log('onChanged');

	var node = sync2all.bookmarks.ids[id];
	if (!node) return; // somewhere outside the synced folder (or bug)

	if (node.url) {
		// bookmark
		
		if (changeInfo.url != node.url) {
			node.setUrl(this, changeInfo.url);
		}

		if (changeInfo.title != node.title) {
			node.setTitle(this, changeInfo.title);
		}

	} else {
		// folder
		// only title changes are possible

		if (node.title == changeInfo.title) {
			console.log('nothing changed.')
			return; // nothing changed (or changed by me?)
		}

		node.setTitle(this, changeInfo.title);
	}
	sync2all.commit();
}

