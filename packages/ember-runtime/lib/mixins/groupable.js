/**
@module ember
@submodule ember-runtime
*/

var get = Ember.get, set = Ember.set, getProperties = Ember.getProperties,
    forEach = Ember.EnumerableUtils.forEach;


var GroupedContentGroup = Ember.ArrayProxy.extend(Ember.SortableMixin, {
  sortProperties: Ember.computed.oneWay('parentController.sortProperties'),
  sortAscending: Ember.computed.oneWay('parentController.sortAscending'),
  sortFunction: Ember.computed.oneWay('parentController.sortFunction')
});

var GroupedContent = Ember.ArrayProxy.extend(Ember.SortableMixin, {
  sortProperties: Ember.computed.oneWay('parentController.groupedContentSortProperties'),
  sortAscending: Ember.computed.oneWay('parentController.groupedContentSortAscending'),
  sortFunction: Ember.computed.oneWay('parentController.groupedContentSortFunction')
});

/**
  `Ember.GroupableMixin` provides a standard interface for array proxies
  to specify a group by and maintain this grouping when objects are added,
  removed, or updated without changing the implicit order of their underlying
  content array:

  ```javascript
  users = [
    {name: 'huafu', gender: 'male'},
    {name: 'pattiya', gender: 'female'},
    {name: 'pawlo', gender: 'male'},
  ];

  usersController = Ember.ArrayProxy.create(Ember.GroupableMixin, {
    content: users,
    groupProperties: ['gender']
  });

  usersController.get('groupedContent.firstObject');
  // {gender: 'male', content: [{name: 'huafu', gender: 'male'}, {name: 'pawlo', gender: 'male'}]}
  usersController.get('groupedContent.lastObject');
  // {gender: 'female', content: [{name: 'pattiya', gender: 'female'}]}

  usersController.addObject({name: 'hector', gender: 'male'});
  usersController.get('groupedContent.firstObject');
  // {gender: 'male', content: [{name: 'huafu', gender: 'male'}, {name: 'pawlo', gender: 'male'}, {name: 'hector', gender: 'male'}]}
  ```

  Each group in the `groupedContent` property will have all the `groupProperties` of its contained objects set on itself.

  If you are using the SortableMixin on your class using this GroupableMixin, the `sortProperties`, `sortAscending` and
  `sortFunction` properties will be reported on each `groupedContent` group (tho you can override this, see above) so that
  the items in your groups are kept in order.

  You can also define the sort order of the groups in the `groupedContent` property by defining `groupedContentSortProperties`,
  `groupedContentSortAscending` and `groupedContentSortFunction` as you'd do directly on the `groupedContent` using the
  SortableMixin.

  Since for each group by default you only have access to the properties from `groupProperties`, you can also extend the
  class used to handle groups by overriding the `groupedContentGroup` property using `Ember.GroupableMixin.GroupedContentGroup`
  as the base class.

  ```javascript
  usersController.set('groupedContentSortProperties', ['gender']);
  usersController.get('groupedContent.firstObject');
  // {gender: 'female', content: [{name: 'pattiya', gender: 'female'}]}

  usersController.set('sortProperties', ['name']);
  usersController.get('groupedContent.lastObject');
  // {gender: 'male', content: [{name: 'hector', gender: 'male'}, {name: 'huafu', gender: 'male'}, {name: 'pawlo', gender: 'male'}]}
  ```

  If you add or remove the properties to group by the groupedContent will be automatically updated.

  @class GroupableMixin
  @namespace Ember
  @uses Ember.MutableEnumerable
*/
Ember.GroupableMixin = Ember.Mixin.create(Ember.MutableEnumerable, {

  /**
   All properties used to group items

   @property groupProperties
   @type Array
   */
  groupProperties: null,

  /**
   Are we grouping items?

   @property isGrouped
   @type Boolean
   */
  isGrouped: Ember.computed.bool('groupProperties'),

  /**
   The grouped content

   @property groupedContent
   @type Ember.ArrayProxy
   */
  groupedContent: Ember.computed('content', 'groupProperties.@each', 'groupedContentClass', 'groupedContentGroupClass', function(key, value) {
    var group, props, groups, object, values, self = this;
    props = this.getProperties(['content', 'isGrouped', 'groupProperties', 'groupedContentClass', 'groupedContentGroupClass'])
    var content = props.content,
        isGrouped = props.isGrouped,
        groupProperties = props.groupProperties,
        groupedContentClass = props.groupedContentClass,
        groupedContentGroupClass = props.groupedContentGroupClass;
    Ember.assert("groupProperties must be null or an array", !groupProperties || Ember.typeOf(groupProperties) === 'array');
    groups = [];
    if (content && isGrouped) {
      forEach(content, function(object) {
        values = getProperties(object, groupProperties);
        if (!(group = self._gmFindGroup(groups, groupProperties, values))) {
          group = self._gmCreateGroup(values);
          groups.push(group);
        }
        group.pushObject(object);
        forEach(groupProperties, function(key) {
          addBeforeObserver(object, key, self, 'contentItemGroupPropertyWillChange');
          addObserver(object, key, self, 'contentItemGroupPropertyDidChange');
        });
      });
    } else {
      groups.push(groupedContentGroupClass.createWithMixins({
        parentController: self,
        content: Ember.computed.oneWay('parentController.content')
      }));
    }
    return groupedContentClass.create({
      parentController: this,
      content: groups
    });
  }),

  /**
   @inheritedDoc
   */
  destroy: function() {
    this._gmRemoveAllContentItemObservers();
    return this._super();
  },

  /**
   @inheritedDoc
   */
  _contentWillChange: Ember.beforeObserver('content', function() {
    this._gmRemoveAllContentItemObservers();
    return this._super();
  }),

  /**
   @inheritedDoc
   */
  contentArrayWillChange: function(array, idx, removedCount, addedCount) {
    if (get(this, 'isGrouped')) {
      var group,
          groupsToRemove = [],
          self = this,
          removed = array.slice(idx, idx + removedCount),
          props = getProperties(this, 'groupProperties', 'groupedContent'),
          groupProperties = props.groupProperties,
          groupedContent = props.groupedContent,
          groups = get(groupedContent, 'content');
      forEach(removed, function(object) {
        group = self._gmFindGroup(groups, groupProperties, getProperties(object, groupProperties));
        if (group) {
          group.removeObject(object);
          if (get(group, 'length') < 1) {
            groupsToRemove.push(group);
          }
        }
        forEach(groupProperties, function(key) {
          Ember.removeObserver(object, key, self, 'contentItemGroupPropertyDidChange');
          Ember.removeBeforeObserver(object, key, self, 'contentItemGroupPropertyWillChange');
        });
      });
      groupsToRemove = groupsToRemove.uniq();
      groupedContent.removeObjects(groupsToRemove);
      groupsToRemove.invoke('destroy');
    }
    return this._super.apply(this, arguments);
  },

  /**
   @inheritedDoc
   */
  contentArrayDidChange: function(array, idx, removedCount, addedCount) {
    if (get(this, 'isGrouped')) {
      var group, values,
          groupsToAdd = [],
          self = this,
          added = array.slice(idx, idx + addedCount),
          props = getProperties(this, 'groupProperties', 'groupedContent'),
          groupProperties = props.groupProperties,
          groupedContent = props.groupedContent,
          groups = get(groupedContent, 'content');
      forEach(added, function(object) {
        values = getProperties(object, groupProperties);
        group = self._gmFindGroup(groups, groupProperties, values);
        if (!group) {
          group = self._gmCreateGroup(values);
          groupsToAdd.push(group);
        }
        group.addObject(object);
        forEach(groupProperties, function(key) {
          Ember.addBeforeObserver(object, key, self, 'contentItemGroupPropertyWillChange');
          Ember.addObserver(object, key, self, 'contentItemGroupPropertyDidChange');
        });
      });
      groupedContent.pushObjects(groupsToAdd);
    }
    return this._super.apply(this, arguments);
  },

  /**
   Called when one of the groupProperties will change on one object of the collection

   @method contentItemGroupPropertyWillChange
   @param {Object} object
   @param {String} key
   */
  contentItemGroupPropertyWillChange: function(object, key) {
    if (get(this, 'isGrouped')) {
      var group, groups,
          props = getProperties(this, 'groupedContent', 'groupProperties'),
          groupedContent = props.groupedContent,
          groupProperties = props.groupProperties;
      groups = get(groupedContent, 'content');
      group = this._gmFindGroup(groups, groupProperties, getProperties(object, groupProperties));
      if (group) {
        group.removeObject(object);
        if (get(group, 'length') < 1) {
          groupedContent.removeObject(group);
        }
      }
    }
  },

  /**
   Called when one of the groupProperties changed on one object of the collection

   @method contentItemGroupPropertyDidChange
   @param {Object} object
   @param {String} key
   */
  contentItemGroupPropertyDidChange: function(object, key) {
    if (get(this, 'isGrouped')) {
      var group, groups, values,
          props = getProperties(this, 'groupedContent', 'groupProperties'),
          groupedContent = props.groupedContent,
          groupProperties = props.groupProperties;
      groups = get(groupedContent, 'content');
      values = getProperties(object, groupProperties);
      group = this._gmFindGroup(groups, groupProperties, values);
      if (!group) {
        group = this._gmCreateGroup(values);
        groupedContent.pushObject(group);
      }
      group.pushObject(object);
    }
  },

  /**
   Sort the grouped content by those properties

   @property groupedContentSortProperties
   @type Array
   */
  groupedContentSortProperties: Ember.computed.oneWay('groupProperties'),

  /**
   Are we sorting groupedContent asc or desc?

   @property groupedContentSortAscending
   @type Boolean
   */
  groupedContentSortAscending: Ember.computed.oneWay('sortAscending'),

  /**
   Sort function used to sort values of the groupedContent

   @property groupedContentSortFunction
   @type Function
   */
  groupedContentSortFunction: Ember.compare,

  /**
   The class to use for the groupedContent

   @property groupedContentClass
   @type {subclass of Ember.GroupableMixin.GroupContent}
   */
  groupedContentClass: GroupedContent,

  /**
   The class to use for each group of the groupedContent

   @property groupedContentGroupClass
   @type {subclass of Ember.GroupableMixin.GroupContentGroup}
   */
  groupedContentGroupClass: GroupedContentGroup,

  /**
   Remove all observers of all objects of the collection for this mixin

   @method _gmRemoveAllContentItemObservers
   */
  _gmRemoveAllContentItemObservers: function() {
    var self = this,
        props = getProperties(this, 'content', 'groupProperties'),
        content = props.content,
        groupProperties = props.groupProperties;
    if (content && groupProperties) {
      forEach(content, function(object) {
        forEach(groupProperties, function(key) {
          Ember.removeObserver(object, key, self, 'contentItemGroupPropertyDidChange');
          Ember.removeBeforeObserver(object, key, self, 'contentItemGroupPropertyWillChange');
        });
      });
    }
  },

  /**
   Find a group for the given property names and values

   @method _gmFindGroup
   @param {Array} groups
   @param {Array} propNames
   @param {Object} propValues
   @return Ember.GroupableMixin.GroupedContentGroup
   */
  _gmFindGroup: function(groups, propNames, propValues) {
    var found = void(0);
    forEach(groups, function(group) {
      var given = getProperties(group, propNames), ok = true;
      forEach(propNames, function(key) {
        if (given[key] !== propValues[key]) {
          ok = false;
          return false;
        }
      });
      if (ok) {
        found = group;
        return false;
      }
    });
    return found;
  },

  /**
   Create a group for this collection and the given properties

   @method _gmCreateGroup
   @param {Object} properties
   @return Ember.GroupableMixin.GroupedContentGroup
   */
  _gmCreateGroup: function(properties) {
    var props;
    props = Ember.merge({
      content: [],
      parentController: this
    }, properties);
    return get(this, 'groupedContentGroupClass').create(props);
  }
});


Ember.GroupableMixin.GroupContent = GroupedContent;
Ember.GroupableMixin.GroupContentGroup = GroupedContentGroup;
