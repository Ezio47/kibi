define(function (require) {

  require('ui/kibi/directives/eeg');
  require('plugins/kibana/settings/sections/kibi_relations/styles/relations.less');
  require('ui/kibi/directives/kibi_validate');

  var _ = require('lodash');

  var app = require('ui/modules').get('apps/settings', ['kibana']);

  app.directive('kibiDebounce', function ($timeout) {
    return {
      restrict: 'A',
      require: 'ngModel',
      priority: 99,
      link: function (scope, elm, attr, ngModelCtrl) {
        if (attr.type === 'radio' || attr.type === 'checkbox') return;

        elm.unbind('input');

        var debounce;
        elm.bind('input', function () {
          $timeout.cancel(debounce);
          debounce = $timeout(function () {
            scope.$apply(function () {
              ngModelCtrl.$setViewValue(elm.val());
            });
          }, attr.ngDebounce || 1000);
        });
        elm.bind('blur', function () {
          scope.$apply(function () {
            ngModelCtrl.$setViewValue(elm.val());
          });
        });
      }
    };
  });

  app.directive('kibiStopEnterKeyDown', function () {
    return {
      restrict: 'A',
      link: function (scope, element, attr) {
        element.bind('keydown', function (e) {
          if (e.which === 13) {
            e.preventDefault();
            e.stopPropagation();
          }
        });
      }
    };
  });


  require('ui/routes')
  .when('/settings/relations', {
    template: require('plugins/kibana/settings/sections/kibi_relations/index.html'),
    reloadOnSearch: false
  });

  app.controller('RelationsController',
  function (Promise, es, kibiState, $rootScope, $scope, config, Private, $element, $timeout, kbnUrl, createNotifier,
            kibiEnterpriseEnabled) {
    var notify = createNotifier({
      location: 'Relations Editor'
    });

    var color = Private(require('ui/vislib/components/color/color'));
    var relationsHelper = Private(require('ui/kibi/helpers/relations_helper'));

    $scope.kibiEnterpriseEnabled = kibiEnterpriseEnabled;

    $scope.unique = _.unique;

    // tabs
    $scope.tab = {
      indexRel: true,
      dashboardRel: false
    };

    $scope.tabClick = function (currentTab) {
      switch (currentTab) {
        case 'index':
          $scope.tab.indexRel = true;
          $scope.tab.dashboardRel = false;
          break;
        case 'dashboard':
          $scope.tab.dashboardRel = true;
          $scope.tab.indexRel = false;
          break;
      }
    };

    // advanced options button
    $scope.edit = function (item, index) {
      var params = {
        service: 'indices' in item ? 'indices' : 'dashboards',
        id: index
      };

      kbnUrl.change('/settings/relations/{{ service }}/{{ id }}', params);
    };

    $scope.relations = config.get('kibi:relations');
    $scope.relationalPanel = config.get('kibi:relationalPanel');

    $scope.$watch('relationalPanel', function () {
      config.set('kibi:relationalPanel', $scope.relationalPanel);
    });

    var indexToDashboardsMap = null;
    var nodeTypes = [];

    /**
     * creates a map index -> dashboards
     *  {
     *    indexId: [dashboardId1, dashboardId2],
     *    ...
     *  }
     */
    $scope.getIndexToDashboardMap = function (dashboardIds, ignoreMissingSavedSearch = false) {
      var _createMap = function (results) {
        // postprocess the results to create the map
        var indexToDashboardArrayMap = {};
        _.each(results, function ({ savedDash, savedSearchMeta }) {
          if (savedSearchMeta && !indexToDashboardArrayMap[savedSearchMeta.index]) {
            indexToDashboardArrayMap[savedSearchMeta.index] = [savedDash.id];
          } else {
            if (savedSearchMeta && indexToDashboardArrayMap[savedSearchMeta.index].indexOf(savedDash.id) === -1) {
              indexToDashboardArrayMap[savedSearchMeta.index].push(savedDash.id);
            }
          }
        });
        return indexToDashboardArrayMap;
      };

      return kibiState._getDashboardAndSavedSearchMetas(dashboardIds, ignoreMissingSavedSearch).then(function (results) {
        return _createMap(results);
      });
    };

    /**
     * Filters out the dashboards that are not relevant in the given row
     * The row index should be passed in options as **rowIndex**
     * The selected flag is passed by the kibi-delect directive to indicate that the item is the selected one
     */
    $scope.filterDashboards = function (item, options, selected) {
      if (selected !== undefined && selected === true) {
        return false;
      }

      var relDash = $scope.relations.relationsDashboards[options.rowIndex];

      if (!item || !item.value) {
        // this is the watched value
        return _.pluck($scope.relations.relationsIndices, 'id').concat(relDash);
      }
      var remove = true;

      // do not remove if the dashboard is associated with an index
      if (!!indexToDashboardsMap) {
        _.each(indexToDashboardsMap, function (dashboards) {
          if (dashboards.indexOf(item.value) !== -1) {
            remove = false;
            return false;
          }
        });
      }

      // remove if the dashboard is not in the list of dashboards that are directly connected to item.value
      var connectedDashboards = [];
      if (!!relDash.dashboards[0] && !relDash.dashboards[1]) {
        connectedDashboards = _getConnectedDashboards(relDash.dashboards[0], relDash.relation);
      } else if (!!relDash.dashboards[1] && !relDash.dashboards[0]) {
        connectedDashboards = _getConnectedDashboards(relDash.dashboards[1], relDash.relation);
      } else if (!relDash.dashboards[0] && !relDash.dashboards[1] && !!relDash.relation) {
        // filter based on the selected relation
        connectedDashboards = _getConnectedDashboards(null, relDash.relation);
      }
      if (connectedDashboards.length && connectedDashboards.indexOf(item.value) === -1) {
        remove = true;
      }

      if (!!relDash.dashboards[0] && !!relDash.dashboards[1] && !!relDash.relation) {
        remove = true;
      }
      return remove;
    };

    /**
     * Returns the index associated with dashboardId
     */
    function _getIndexForDashboard(dashboardId) {
      var dIndex = '';

      if (!dashboardId) {
        return '';
      }
      _.each(indexToDashboardsMap, function (dashboards, index) {
        if (dashboards.indexOf(dashboardId) !== -1) {
          dIndex = index;
          return false;
        }
      });
      return dIndex;
    }

    /**
     * Returns the list of dashboards that are directly connected to dashboardId
     */
    function _getConnectedDashboards(dashboardId, relDash) {
      var index = _getIndexForDashboard(dashboardId);

      return _($scope.relations.relationsIndices).map(function (relInd) {
        if (!relDash || relDash === relInd.id) {
          var dashboards = [];

          if ((!!relDash && !index) || index === relInd.indices[0].indexPatternId) {
            dashboards = dashboards.concat(indexToDashboardsMap[relInd.indices[1].indexPatternId]);
          }
          if ((!!relDash && !index) || index === relInd.indices[1].indexPatternId) {
            dashboards = dashboards.concat(indexToDashboardsMap[relInd.indices[0].indexPatternId]);
          }
          return dashboards;
        }
      }).flatten().compact().uniq().value();
    }

    /**
     * Filters out the relations that are not relevant in given row
     * The row index should be passed in options as **rowIndex** property
     * The selected flag is passed by the kibi-delect directive to indicate that the item is the selected one
     */
    $scope.filterRelations = function (item, options, selected) {
      if (selected !== undefined && selected === true) {
        return false;
      }
      // here for anything about indices relations - we take them from config as they are already saved
      var relations = config.get('kibi:relations');

      // for anything about the dashboards relations - we take them from the scope
      var dashboards = $scope.relations.relationsDashboards[options.rowIndex].dashboards;
      var lIndex = '';
      var rIndex = '';

      if (!item || !item.value) {
        return _.pluck(relations.relationsIndices, 'id')
        .concat(_.pluck(relations.relationsIndices, 'label'))
        .concat(dashboards);
      }
      _.each(indexToDashboardsMap, function (map, index) {
        if (map.indexOf(dashboards[0]) !== -1) {
          lIndex = index;
        }
        if (map.indexOf(dashboards[1]) !== -1) {
          rIndex = index;
        }
        if (lIndex && rIndex) {
          // break the loop
          return false;
        }
      });

      const validRelations = _(relations.relationsIndices).map(function (relInd) {
        if (lIndex && rIndex) {
          if ((lIndex === relInd.indices[0].indexPatternId && rIndex === relInd.indices[1].indexPatternId) ||
              (lIndex === relInd.indices[1].indexPatternId && rIndex === relInd.indices[0].indexPatternId)) {
            return relInd.id;
          }
        } else if (lIndex) {
          if (lIndex === relInd.indices[0].indexPatternId || lIndex === relInd.indices[1].indexPatternId) {
            return relInd.id;
          }
        } else if (rIndex) {
          if (rIndex === relInd.indices[0].indexPatternId || rIndex === relInd.indices[1].indexPatternId) {
            return relInd.id;
          }
        }
      }).compact().value();
      const usedRelations = _(relations.relationsDashboards).map(function (relDash, offset) {
        if (offset !== options.rowIndex && dashboards[0] && dashboards[1]) {
          if ((dashboards[0] === relDash.dashboards[0] && dashboards[1] === relDash.dashboards[1]) ||
              (dashboards[0] === relDash.dashboards[1] && dashboards[1] === relDash.dashboards[0])) {
            return relDash.relation;
          }
        }
      }).compact().value();
      return (Boolean(lIndex) || Boolean(rIndex)) &&
      // remove item if it is not in any valid relation for the indices lIndex and rIndex
      validRelations.indexOf(item.value) === -1 ||
      // remove item if it is already used for the same dashboards
      usedRelations.indexOf(item.value) !== -1;
    };

    function _getRelationLabel(relationId) {
      var label;

      _.each($scope.relations.relationsIndices, function (relation) {
        if (relation.id === relationId) {
          label = relation.label;
          return false;
        }
      });
      return label;
    }

    function _addClickHandlers(name, options) {
      options.onNodeDragEnd = function () {
        $rootScope.$emit('egg:' + name + 'Graph:run', 'exportGraph');
      };
    }

    /**
     * Updates the relationships between dashboards
     */
    function _updateRelationsDashboards(oldRelations) {
      var g = {
        options: {
          monitorContainerSize: true,
          alwaysShowLinksLabels: true,
          stopAfter: 2000,
          groupingForce: {},
          nodeIcons: {},
          minNodeSize: 20,
          colors: {}
        },
        nodes: [],
        links: []
      };

      var relationId = function (relation) {
        var i0 = relation.dashboards[0];
        var i1 = relation.dashboards[1];
        return relation.relation + (i0 < i1 ? i0 + i1 : i1 + i0);
      };

      // check for duplicates
      var uniq = _.groupBy($scope.relations.relationsDashboards, function (relation) {
        if (relation.relation) {
          return relationId(relation);
        }
      });

      $scope.invalid = false;
      _.each($scope.relations.relationsDashboards, function (relDash) {
        var error = '';

        if (!!relDash.dashboards[0] && !!relDash.dashboards[1]) {
          if (relDash.relation) {
            var key = relationId(relDash);
            if (uniq[key].length !== 1) {
              error = 'These relationships are equivalent, please remove one.';
            }

            // build the graph visualisation
            var sourceNodeIndexId = _getIndexForDashboard(relDash.dashboards[0]);
            var targetNodeIndexId = _getIndexForDashboard(relDash.dashboards[1]);

            g.nodes.push({
              id: relDash.dashboards[0],
              label: relDash.dashboards[0],
              nodeType: sourceNodeIndexId,
              size: g.options.minNodeSize
            });
            g.nodes.push({
              id: relDash.dashboards[1],
              label: relDash.dashboards[1],
              nodeType: targetNodeIndexId,
              size: g.options.minNodeSize
            });
            g.links.push({
              source: relDash.dashboards[0],
              target: relDash.dashboards[1],
              linkType: _getRelationLabel(relDash.relation),
              data: {
                relation: relDash.relation,
                dashboards: relDash.dashboards
              },
              undirected: true
            });
          }
        }
        relDash.errors = error && [ error ] || [];
        if (!!error) {
          $scope.invalid = true;
        }
      });

      _.each(nodeTypes, function (nodeType) {
        g.options.colors[nodeType] = $scope.typeToColor(nodeType);
      });

      g.nodes = _.uniq(g.nodes, function (node) {
        return node.id;
      });

      if (!$scope.dashboardsGraph && $scope.relations.relationsDashboardsSerialized) {
        // check the serialized one
        var graph = $scope.relations.relationsDashboardsSerialized;
        _addClickHandlers('dashboards', graph.options);
        $scope.dashboardsGraph = graph;

      } else {
        _addClickHandlers('dashboards', g.options);
        $scope.dashboardsGraph = g;
      }

      var isEqual = _($scope.relations.relationsDashboards).map(function (relation) {
        return _.omit(relation, [ '$$hashKey', 'errors' ]);
      }).isEqual(oldRelations);

      // isValid checks that the DOM element contains the ng-valid class
      // to be sure it is added, we do the following in the next tick
      $timeout(() => {
        if (_isValid('dashboards') && !isEqual) {
          save('dashboards');
        }
      });
    }

    $scope.$watch(function ($scope) {
      return {
        labelsFromIndices: _.pluck($scope.relations.relationsIndices, 'label'),
        dashboards: _.map($scope.relations.relationsDashboards, function (relation) {
          return _.omit(relation, [ 'errors' ]);
        })
      };
    }, function (newRelations, oldRelations) {
      if (indexToDashboardsMap === null) {
        $scope.getIndexToDashboardMap(null, true).then(function (map) {
          indexToDashboardsMap = map;
          _updateRelationsDashboards(oldRelations);
        }).catch(function (err) {
          notify.error('Problem getting index to dashboard map', err);
        });
      } else {
        _updateRelationsDashboards(oldRelations);
      }
    }, true);

    // Listen to changes of relations between indices
    $scope.$watch(function ($scope) {
      return _.map($scope.relations.relationsIndices, function (relation) {
        return _.omit(relation, ['errors', 'id']); // id is redundant
      });
    }, function (newRelations, oldRelations) {
      // each node is an index
      var g = {
        options: {
          showLegend: false,
          monitorContainerSize: true,
          alwaysShowLinksLabels: true,
          stopAfter: 2000,
          groupingForce: {},
          nodeIcons: {},
          minNodeSize: 20,
          colors: {}
        },
        nodes: [],
        links: []
      };

      // check for duplicates
      var uniq = _.groupBy($scope.relations.relationsIndices, function (relation, offset) {
        var indexa = relation.indices[0];
        var indexb = relation.indices[1];

        if (indexa.indexPatternId && indexa.path && indexb.indexPatternId && indexb.path) {
          return relationsHelper.getJoinIndicesUniqueID(indexa.indexPatternId, indexa.indexPatternType, indexa.path,
                                                        indexb.indexPatternId, indexb.indexPatternType, indexb.path);
        }
        return offset;
      });

      const indexLabel = function (index) {
        let label = index.indexPatternId;

        if (index.indexPatternType) {
          label += '.' + index.indexPatternType;
        }
        return label + '.' + index.path;
      };

      const checkMappings = [];
      $scope.invalid = false;
      _.each($scope.relations.relationsIndices, function (relation) {

        var indices = relation.indices;
        var errors = [];

        if (indices[0].indexPatternId && indices[0].path && indices[1].indexPatternId && indices[1].path) {

          // automatically compute the label if not present
          if (!relation.label) {
            relation.label = indexLabel(relation.indices[0]) + ' -- ' + indexLabel(relation.indices[1]);
          }

          var key = relationsHelper.getJoinIndicesUniqueID(indices[0].indexPatternId, indices[0].indexPatternType, indices[0].path,
                                                           indices[1].indexPatternId, indices[1].indexPatternType, indices[1].path);

          if (uniq[key].length !== 1) {
            errors.push('These relationships are equivalent, please remove one.');
          }
          if (indices[0].indexPatternId === indices[1].indexPatternId &&
              indices[0].indexPatternType === indices[1].indexPatternType &&
              indices[0].path === indices[1].path) {
            errors.push('Left and right sides of the relation cannot be the same.');
          }
          checkMappings.push(Promise.all([
            es.indices.getFieldMapping({
              index: [ indices[0].indexPatternId ],
              type: indices[0].indexPatternType || [],
              field: [ indices[0].path ],
              includeDefaults: true
            }),
            es.indices.getFieldMapping({
              index: [ indices[1].indexPatternId ],
              type: indices[1].indexPatternType || [],
              field: [ indices[1].path ],
              includeDefaults: true
            })
          ])
          .then(([ leftMapping, rightMapping ]) => {
            return { leftMapping, rightMapping, relation };
          }));
          relation.id = key;

          if (relation.label) {
            // build the graph visualisation
            var sourceNodeId = indices[0].indexPatternId;
            var targetNodeId = indices[1].indexPatternId;

            g.nodes.push({
              id: sourceNodeId,
              label: sourceNodeId,
              nodeType: sourceNodeId,
              size: g.options.minNodeSize
            });
            g.nodes.push({
              id: targetNodeId,
              label: targetNodeId,
              nodeType: targetNodeId,
              size: g.options.minNodeSize
            });
            g.links.push({
              source: sourceNodeId,
              target: targetNodeId,
              linkType: relation.label,
              undirected: true
            });

            // build types array to build color map
            if (nodeTypes.indexOf(sourceNodeId) === -1) {
              nodeTypes.push(sourceNodeId);
            }
            if (nodeTypes.indexOf(targetNodeId) === -1) {
              nodeTypes.push(targetNodeId);
            }

          }
        }

        relation.errors = errors;
        if (errors.length) {
          $scope.invalid = true;
        }
      });

      $scope.typeToColor = color(nodeTypes);
      _.each(nodeTypes, function (nodeType) {
        g.options.colors[nodeType] = $scope.typeToColor(nodeType);
      });

      g.nodes = _.uniq(g.nodes, 'id');
      if (!$scope.indicesGraph && $scope.relations.relationsIndicesSerialized) {
        // check the serialized one
        var graph = $scope.relations.relationsIndicesSerialized;
        _addClickHandlers('indices', graph.options);
        $scope.indicesGraph = graph;

      } else {
        _addClickHandlers('indices', g.options);
        $scope.indicesGraph = g;
      }

      var isEqual = _($scope.relations.relationsIndices).map(function (relation) {
        return _.omit(relation, [ '$$hashKey', 'errors' ]);
      }).isEqual(oldRelations);
      // isValid checks that the DOM element contains the ng-valid class
      // to be sure it is added, we do the following in the next tick.
      // If not, ng-valid is not present when the relation label is automatically created.
      $timeout(() => {
        if (_isValid('indices') && !isEqual) {
          Promise.all(checkMappings)
          .then(mappings => {
            /**
             * Returns true if the index and type of the leftMapping are equal to those of the rightMapping
             */
            const areMappingsCompatibleForSirenJoin = function (leftMapping, rightMapping) {
              return leftMapping.index === rightMapping.index && leftMapping.type === rightMapping.type;
            };

            /**
             * Checks if all the fields in the indices matching the index pattern have the same mapping.
             * Returns true if this is the case.
             */
            const doAllFieldsHaveTheSameMapping = function (relation, mapping, { indexPatternId, indexPatternType, path }) {
              if (_.size(mapping) === 1) {
                return true;
              }

              const indicesAndMapping = _.map(mapping, (value, indexName) => {
                const type = indexPatternType || Object.keys(value.mappings)[0];
                return {
                  index: indexName,
                  mapping: _.values(value.mappings[type][path].mapping)[0]
                };
              });

              let compatible = true;
              for (let i = 1; i < indicesAndMapping.length; i++) {
                if (!areMappingsCompatibleForSirenJoin(indicesAndMapping[i - 1].mapping, indicesAndMapping[i].mapping)) {
                  compatible = false;
                  break;
                }
              }
              if (!compatible) {
                if (!relation.errors) {
                  relation.errors = [];
                }
                const msg = _(indicesAndMapping)
                // group the indices having the same index/type mapping together
                .groupBy(({ mapping }) => JSON.stringify(_.pick(mapping, [ 'index', 'type' ]), null, ' '))
                // indicate which indices have a certain index/type mapping
                .map((values, indexAndType) => `<li>on indices ${_.pluck(values, 'index').join(', ')} the mapping is ${indexAndType}</li>`)
                .value()
                .join('');
                relation.errors.push(`The mappings for the field ${path} differ on some indices matching the pattern ${indexPatternId}:<br/>
                                     <ul>
                                      ${msg}
                                    </ul>`);
                $scope.invalid = true;
                return false;
              }
              return true;
            };

            /**
             * Returns the mapping of a field
             */
            const getFieldMapping = function (mapping, { indexPatternType, path }) {
              const index = Object.keys(mapping)[0];
              const type = indexPatternType || Object.keys(mapping[index].mappings)[0];
              return _.values(mapping[index].mappings[type][path].mapping)[0];
            };

            _.each(mappings, ({ leftMapping, rightMapping, relation }) => {
              const indices = relation.indices;

              // check if all field mappings for a given index pattern are the same
              if (!doAllFieldsHaveTheSameMapping(relation, leftMapping, indices[0]) ||
                  !doAllFieldsHaveTheSameMapping(relation, rightMapping, indices[1])) {
                // do not check any further since the indices in the current pattern are incompatible already
                return;
              }

              // check if the field joined together are compatible
              const leftFieldMapping = getFieldMapping(leftMapping, indices[0]);
              const rightFieldMapping = getFieldMapping(rightMapping, indices[1]);

              if (!areMappingsCompatibleForSirenJoin(leftFieldMapping, rightFieldMapping)) {
                if (!relation.errors) {
                  relation.errors = [];
                }
                const leftFieldPath = `${indices[0].indexPatternId}/${indices[0].indexPatternType}/${indices[0].path}`;
                const rightFieldPath = `${indices[1].indexPatternId}/${indices[1].indexPatternType}/${indices[1].path}`;

                const left = `${leftFieldPath} has mapping ${JSON.stringify(_.pick(leftFieldMapping, [ 'index', 'type' ]), null, ' ')}`;
                const right = `${rightFieldPath} has mapping ${JSON.stringify(_.pick(rightFieldMapping, [ 'index', 'type' ]), null, ' ')}`;
                relation.errors.push(`<b>Incompatible fields:</b> ${left} while ${right}. They must be the same!`);
                $scope.invalid = true;
              }
            });
          })
          .catch(notify.error)
          .then(() => save('indices'))
          .then(function () {
            if (oldRelations && oldRelations.length) {
              var relationsIndices = config.get('kibi:relations').relationsIndices;

              if (relationsIndices.length < oldRelations.length) {
                // a relation was deleted
                var diff = _.difference(_.pluck(oldRelations, 'id'), _.pluck(relationsIndices, 'id'));
                _.each($scope.relations.relationsDashboards, function (relation) {
                  if (diff.indexOf(relation.relation) !== -1) {
                    relation.relation = '';
                  }
                });
              } else if (relationsIndices.length === oldRelations.length) {
                // check if the definition of a relation was changed
                var clearRelation = function (oldRelationId) {
                  _.each($scope.relations.relationsDashboards, function (relation) {
                    if (relation.relation === oldRelationId) {
                      relation.relation = '';
                    }
                  });
                };

                for (var i = 0; i < relationsIndices.length; i++) {
                  if (relationsIndices[i].id && oldRelations[i].id) {
                    const newRelation = relationsHelper.getRelationInfosFromRelationID(relationsIndices[i].id);
                    const oldRelation = relationsHelper.getRelationInfosFromRelationID(oldRelations[i].id);

                    if (newRelation.source.index !== oldRelation.source.index || // left index changed
                        newRelation.target.index !== oldRelation.target.index) { // right index changed
                      clearRelation(oldRelations[i].id);
                    }
                  }
                }
              }
            }
          });
        }
      });
    }, true);

    var indicesGraphExportOff = $rootScope.$on('egg:indicesGraph:results', function (event, method, results) {
      if (method === 'exportGraph') {
        var relations = config.get('kibi:relations');
        relations.relationsIndicesSerialized = results;
        config.set('kibi:relations', relations);
      }
    });
    var dashboardsGraphExportOff = $rootScope.$on('egg:dashboardsGraph:results', function (event, method, results) {
      if (method === 'exportGraph') {
        var relations = config.get('kibi:relations');
        relations.relationsDashboardsSerialized = results;
        config.set('kibi:relations', relations);
      }
    });
    $scope.$on('$destroy', function () {
      relationsHelper.destroy();
      indicesGraphExportOff();
      dashboardsGraphExportOff();
    });

    function _areRelationsValid() {
      const { validDashboards, validIndices } = relationsHelper.checkIfRelationsAreValid(true);
      $scope.dashboardsRelationsAreValid = validDashboards;
      $scope.indicesRelationsAreValid  = validIndices;
    }
    _areRelationsValid();

    function _isValid(graph) {
      if (graph === 'indices') {
        return $element.find('form[name="indicesForm"]').hasClass('ng-valid');
      } else {
        return $element.find('form[name="dashboardsForm"]').hasClass('ng-valid');
      }
    }

    function save(graph) {
      var relations = config.get('kibi:relations');

      if (graph === 'indices') {
        relations.relationsIndices = _.map($scope.relations.relationsIndices, function (relation) {
          return _.omit(relation, [ 'errors' ]);
        });
      } else {
        relations.relationsDashboards = _.map($scope.relations.relationsDashboards, function (relation) {
          return _.omit(relation, [ 'errors' ]);
        });
      }

      return config.set('kibi:relations', relations)
      .then(_areRelationsValid.bind(this));
    }
  });
});
