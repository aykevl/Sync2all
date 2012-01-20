'use strict';

function BrowserBase() {
	TreeBasedLink.call(this);
}
BrowserBase.prototype.__proto__ = TreeBasedLink.prototype;

// To call when a bookmark node has been added. The node may be a modified
// object got with the event.
BrowserBase.prototype.onCreated = function (node) {
	console.log('evt_onCreated', node);
	if (node.parentId == this.creating_parentId &&
			(node.url == this.creating_url || node.title == this.creating_title)) {
		delete this.creating_parentId;
		delete this.creating_url;
		delete this.creating_title;
		return;
	}
	if (node.id in this.ids) return; // already tracked
	if (!this.ids[node.parentId]) return; // not in the synced folder
	var parentNode = this.ids[node.parentId];
	if (node.url) {
		// bookmark
		console.log('Created new bookmark: '+node.url);
		var bookmark = parentNode.addBookmark(this, {title: node.title, url: node.url, mtime: node.mtime, id: node.id});
	} else {
		// folder
		console.log('Created new empty folder: '+node.title);
		var folder = parentNode.addFolder(this, {title: node.title, mtime: node.mtime, id: node.id});
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

	// if the bookmark has been moved by Sync2all, ignore this event
	if (node && newParent && node.parentNode == newParent) {
		console.log('Move: the node has been moved by this extension, so doing nothing now.');
		return;
	}

	// if node is moved to outside synced folder
	if (!newParent) {
		// if the node comes from outside the synced folder
		if (!oldParent) {
			if (!node) {
				console.log('Bookmark/folder outside synchronized folder moved. Ignoring.');
				return;
			} else {
				console.log('BUG: only the node is known, not the rest \
						(including the parent!)');
				return;
			}
		} else { // the 'else' is not really needed
			if (!node) {
				console.log('BUG: only the old parent is known, not the node \
						nor the new parent');
				return;
			} else {
				// newParent is not known, node and oldParent are known.
				console.log('Move: new parent not found. Thus this bookmark/folder is \
						moved to outside the synced folder.');

				// remove the node
				delete this.ids[node.id];
				rmNode(this, node); // parent needed for bookmarks
				sync2all.commit()
				return;
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
				return;
			} else {
				console.log('BUG: the node is not known, but the old parent \
						and the new parent are.');
				return;
			}
		} else {
			if (!oldParent) {
				console.log('BUG: only the old parent is not known. The node \
						and the new parent are.');
				return;
			} else {
				// the bookmark has been moved within the synced folder tree.
				// Nothing strange has happened.
			}
		}
	}

	// newParent, node and oldParent are 'defined' variables. (i.e. not
	// 'undefined').

	if (newParent == oldParent) {
		// node moved inside folder (so nothing has happened, don't know
		// whether this is really needed, Chrome might catch this).
		console.log('Move: newParent and oldParent are the same, so nothing moved.');
		return;
	}

	
	// Bookmark is moved inside synced folder.

	node.parentNode = newParent;

	if (node.url) {
		// bookmark
		console.log('Moved '+node.url+' from '+(oldParent?oldParent.title:'somewhere in the Other Bookmarks menu')+' to '+newParent.title);
		newParent.bm[node.url] = node;
		delete oldParent.bm[node.url];
		broadcastMessage('bm_mv', this, [node, oldParent]);
	} else {
		// folder
		if (newParent.f[node.title]) {
			console.log('FIXME: duplicate folder overwritten (WILL FAIL AT SOME POINT!!!)');
		}
		newParent.f[node.title] = node;
		delete oldParent.f[node.title];
		broadcastMessage('f_mv', this, [node, oldParent]);
	}
	sync2all.commit();
}

BrowserBase.prototype.onChanged = function (node, changeInfo) {
	console.log('onChanged');
	if (node.url) {
		// bookmark
		
		// has anything changed?
		if (changeInfo.url == node.url && changeInfo.title == node.title) return; // changed by me?
		if (changeInfo.url != node.url) {
			console.log('Url of '+node.title+' changed from '+node.url+' to '+changeInfo.url);

			var oldurl = node.url;

			// delete old reference
			delete node.parentNode.bm[node.url];
			// change url
			node.url = changeInfo.url;

			// does that url already exist?
			if (node.parentNode.bm[node.url]) {
				console.log('"Duplicate URL '+node.url+', merging by removing other...');
				rmBookmark(node.parentNode.bm[node.url]);
			}

			// add new reference
			node.parentNode.bm[node.url] = node;

			broadcastMessage('bm_mod_url', this, [node, oldurl]);
		}

		if (changeInfo.title != node.title) {
			console.log('Title of url '+node.url+' changed from '+node.title+' to '+changeInfo.title);
			var oldtitle = node.title;
			node.title = changeInfo.title;
			broadcastMessage('bm_mod_title', this, [node, oldtitle]);
		}

	} else {
		// folder
		// only title changes are possible

		if (node.title == changeInfo.title) {
			console.log('nothing changed.')
			return; // nothing changed (or changed by me?)
		}

		var oldtitle = node.title;
		var newtitle = changeInfo.title;
		node.title = newtitle;

		var parentNode = node.parentNode;
		delete parentNode.f[oldtitle];
		parentNode.f[newtitle] = node;

		broadcastMessage('f_mod_title', this, [node , oldtitle]);
	}
	sync2all.commit();
}

