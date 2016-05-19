require('firebase');

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

/**
 * Firebase system.
 */
AFRAME.registerSystem('firebase', {
  init: function () {
    var sceneEl = this.sceneEl;
    var config = sceneEl.getAttribute('firebase');
    var self = this;

    this.firebase = firebase.initializeApp(config);
    this.database = firebase.database();

    this.broadcastingEntities = {};
    this.entities = {};

    firebase.database().ref('entities').once('value', function (snapshot) {
      self.handleInitialSync(snapshot.val());
    });

    firebase.database().ref('entities').on('child_added', function (data) {
      self.handleEntityAdded(data.key, data.val());
    });

    firebase.database().ref('entities').on('child_changed', function (data) {
      self.handleEntityChanged(data.key, data.val());
    });

    firebase.database().ref('entities').on('child_removed', function (data) {
      self.handleEntityRemoved(data.key);
    });

    window.addEventListener('beforeunload', function () {
      self.handleExit();
    });
  },

  /**
   * Initial sync.
   */
  handleInitialSync: function (data) {
    var self = this;
    Object.keys(data).forEach(function (entityId) {
      self.handleEntityAdded(entityId, data[entityId]);
    });
  },

  /**
   * Entity added.
   */
  handleEntityAdded: function (id, components) {
    var entity = document.createElement('a-entity');
    this.entities[id] = entity;
    Object.keys(components).forEach(function setComponent (componentName) {
      entity.setAttribute(componentName, components[componentName]);
    });
    this.sceneEl.appendChild(entity);
  },

  /**
   * Entity updated.
   */
  handleEntityChanged: function (id, components) {
    // Don't sync if already broadcasting to self-updating loops.
    if (this.broadcastingEntities[id]) { return; }

    var entity = this.entities[id];
    Object.keys(components).forEach(function setComponent (componentName) {
      entity.setAttribute(componentName, components[componentName]);
    });
  },

  /**
   * Entity removed. Detach.
   */
  handleEntityRemoved: function (id) {
    var entity = this.entities[id];
    entity.parentNode.removeChild(entity);
    delete this.entities[id];
  },

  /**
   * Delete all broadcasting entities.
   */
  handleExit: function () {
    var self = this;
    Object.keys(this.broadcastingEntities).forEach(function (id) {
      delete self.broadcastingEntities[id];
      firebase.database().ref('entities/' + id).remove();
    });
  },

  /**
   * Register.
   */
  registerBroadcast: function (el, components, interval) {
    var broadcastingEntities = this.broadcastingEntities;
    var database = this.database;
    // Initialize entry.
    var id = database.ref().child('entities').push().key;
    broadcastingEntities[id] = el;
  },

  /**
   * Broadcast.
   */
  tick: function (time) {
    var broadcastingEntities = this.broadcastingEntities;
    var database = this.database;

    if (time - this.time < 20) { return; }
    this.time = time;

    Object.keys(broadcastingEntities).forEach(function broadcast (id) {
      var el = broadcastingEntities[id];
      var components = el.getAttribute('firebase-broadcast').components;

      // Build data.
      var data = {};
      components.forEach(function getData (componentName) {
        data[componentName] = el.getComputedAttribute(componentName);
      });

      // Update entry.
      database.ref('entities/' + id).update(data);
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
    databaseURL: {type: 'string'},
    storageBucket: {type: 'string'}
  }
});

/**
 * Broadcast.
 */
AFRAME.registerComponent('firebase-broadcast', {
  schema: {
    id: {default: ''},
    components: {default: ['position', 'rotation']}
  },

  init: function () {
    var el = this.el;
    var system = el.sceneEl.systems.firebase;
    system.registerBroadcast(el, this.data.components);
  }
});
