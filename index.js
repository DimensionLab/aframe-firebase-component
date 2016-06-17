var FirebaseWrapper = require('./firebaseWrapper');

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

/**
 * Firebase system.
 */
AFRAME.registerSystem('firebase', {
  init: function () {
    // Get config.
    var config = this.sceneEl.getAttribute('firebase');  // No getComputedAttr before attach.
    if (!(config instanceof Object)) { config = AFRAME.utils.styleParser.parse(config); }
    if (!config) { return; }

    this.broadcastingEntities = {};
    this.entities = {};
    this.interval = config.interval || 10;

    // Set up Firebase.
    var firebaseWrapper = this.firebaseWrapper = new FirebaseWrapper();
    firebaseWrapper.init(config);
    this.firebase = firebaseWrapper.firebase;
    this.database = firebaseWrapper.database;
    firebaseWrapper.getAllEntities().then(this.handleInitialSync.bind(this));
    firebaseWrapper.onEntityAdded(this.handleEntityAdded.bind(this));
    firebaseWrapper.onEntityChanged(this.handleEntityChanged.bind(this));
    firebaseWrapper.onEntityRemoved(this.handleEntityRemoved.bind(this));
  },

  /**
   * Initial sync.
   */
  handleInitialSync: function (data) {
    var self = this;
    var broadcastingEntities = this.broadcastingEntities;
    Object.keys(data).forEach(function (entityId) {
      if (broadcastingEntities[entityId]) { return; }
      self.handleEntityAdded(entityId, data[entityId]);
    });
  },

  /**
   * Entity added.
   */
  handleEntityAdded: function (id, data) {
    // Already added.
    if (this.entities[id] || this.broadcastingEntities[id]) { return; }

    var entity = document.createElement('a-entity');
    this.entities[id] = entity;

    // Parent node.
    var parentId = data.parentId;
    var parentEl = this.entities[parentId] || this.sceneEl;
    delete data.parentId;

    // Components.
    Object.keys(data).forEach(function setComponent (componentName) {
      if (componentName === 'parentId') { return; }
      setAttribute(entity, componentName, data[componentName]);
    });

    parentEl.appendChild(entity);
  },

  /**
   * Entity updated.
   */
  handleEntityChanged: function (id, components) {
    // Don't sync if already broadcasting to self-updating loops.
    if (this.broadcastingEntities[id]) { return; }

    var entity = this.entities[id];
    Object.keys(components).forEach(function setComponent (componentName) {
      if (componentName === 'parentId') { return; }
      setAttribute(entity, componentName, components[componentName]);
    });
  },

  /**
   * Entity removed. Detach.
   */
  handleEntityRemoved: function (id) {
    var entity = this.entities[id];
    if (!entity) { return; }
    entity.parentNode.removeChild(entity);
    delete this.entities[id];
  },

  /**
   * Register.
   */
  registerBroadcast: function (el) {
    var broadcastingEntities = this.broadcastingEntities;

    // Initialize entry, get assigned a Firebase ID.
    var id = this.firebaseWrapper.createEntity();
    el.setAttribute('firebase-broadcast', 'id', id);
    broadcastingEntities[id] = el;

    // Remove entry when client disconnects.
    this.firebaseWrapper.removeEntityOnDisconnect(id);
  },

  /**
   * Broadcast.
   */
  tick: function (time) {
    if (!this.firebase) { return; }

    var broadcastingEntities = this.broadcastingEntities;
    var firebaseWrapper = this.firebaseWrapper;
    var sceneEl = this.sceneEl;

    if (time - this.time < this.interval) { return; }
    this.time = time;

    Object.keys(broadcastingEntities).forEach(function broadcast (id) {
      var el = broadcastingEntities[id];
      var components = el.getAttribute('firebase-broadcast').components;
      var data = {};

      // Add components to broadcast once.
      if (!el.firebaseBroadcastOnce && el.getAttribute('firebase-broadcast').componentsOnce) {
        components = components.concat(el.getAttribute('firebase-broadcast').componentsOnce);
        el.firebaseBroadcastOnce = true;
      }

      // Parent.
      if (el.parentNode !== sceneEl) {
        var broadcastData = el.parentNode.getAttribute('firebase-broadcast');
        if (!broadcastData) { return; }  // Wait for parent to initialize.
        data.parentId = broadcastData.id;
      }

      // Build data.
      components.forEach(function getData (componentName) {
        data[componentName] = getComputedAttribute(el, componentName);
      });

      // Update entry.
      firebaseWrapper.updateEntity(id, data);
    });
  }
});

/**
 * Data holder for the scene.
 */
AFRAME.registerComponent('firebase', {
  schema: {
    apiKey: {type: 'string'},
    authDomain: {type: 'string'},
    channel: {type: 'string'},
    databaseURL: {type: 'string'},
    interval: {type: 'number'},
    storageBucket: {type: 'string'}
  }
});

/**
 * Broadcast.
 */
AFRAME.registerComponent('firebase-broadcast', {
  schema: {
    id: {default: ''},
    components: {default: ['position', 'rotation']},
    componentsOnce: {default: [], type: 'array'}
  },

  init: function () {
    var data = this.data;
    var el = this.el;
    var system = el.sceneEl.systems.firebase;
    if (data.components.length) {
      system.registerBroadcast(el);
    }
  }
});

/**
 * Get attribute that handles individual component properties.
 */
function getComputedAttribute (el, attribute) {
  // Handle individual component property.
  var split = attribute.split('|');
  if (split.length === 2) {
    return el.getComputedAttribute(split[0])[split[1]];
  }
  return el.getComputedAttribute(attribute);
}

/**
 * Set attribute that handles individual component properties.
 */
function setAttribute (el, attribute, value) {
  // Handle individual component property.
  var split = attribute.split('|');
  if (split.length === 2) {
    el.setAttribute(split[0], split[1], value);
    return;
  }
  el.setAttribute(attribute, value);
}
