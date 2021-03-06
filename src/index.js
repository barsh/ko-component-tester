'use strict'

const ko = require('knockout')
const $ = require('jquery')
const _ = require('lodash')
const simulateEvent = require('simulate-event')

$.fn.simulate = function(eventName, value) {
  if (value) {
    this.val(value)
  }
  if (value) this.val(value)

  var target = this.get(0)
  simulateEvent.simulate(target, eventName, value)
  ko.tasks.runEarly()
}

$.fn.waitForBinding = function(bindingName) {
  if (!ko.bindingHandlers[bindingName])
    throw new Error(`binding does not exist: ${bindingName}`)

  const binding = ko.bindingHandlers[bindingName].init
    ? ko.bindingHandlers[bindingName].init.bind(ko.bindingHandlers[bindingName].init)
    : function() {}

  return new Promise((resolve) => {
    const $el = this
    ko.bindingHandlers[bindingName].init = (el) => {
      if ($el.get(0) === el) {
        binding(...arguments)
        ko.tasks.schedule(() => {
          ko.bindingHandlers[bindingName].init = binding
          resolve($el)
        })
      } else {
        binding(...arguments)
      }
    }
  })
}

$.fn.waitForProperty = function(key, val, timeout = 2000) {
  const prop = access(key.split('.'), this.$data())
  return new Promise((resolve, reject) => {
    if (matches(prop())) {
      return resolve(prop())
    }

    const timeoutId = setTimeout(() => {
      killMe.dispose()
      reject(`Timed out waiting for property ${key}`)
    }, timeout)

    const killMe = prop.subscribe((v) => {
      if (!matches(v)) {
        return
      }

      clearTimeout(timeoutId)
      killMe.dispose()
      ko.tasks.runEarly()
      resolve(v)
    })
  })

  function access([k, ...ks], obj) {
    const p = obj[k]
    return ks.length > 0
      ? access(ks, p)
      : p
  }

  function matches(v) {
    return typeof v !== 'undefined' && (typeof val === 'undefined' || (val instanceof RegExp
      ? val.test(v)
      : v === val))
  }
}

$.fn.$data = function() {
  return this.children().length > 0
    ? ko.dataFor(this.children().get(0))
    : ko.dataFor(ko.virtualElements.firstChild(this.get(0)))
}

$.fn.$context = function() {
  return this.children().length > 0
    ? ko.contextFor(this.children().get(0))
    : ko.contextFor(ko.virtualElements.firstChild(this.get(0)))
}

ko.components.loaders.unshift({
  loadComponent(name, component, done) {
    if (!component.viewModel) {
      class ViewModel { constructor(params) { ko.utils.extend(this, params) } }
      component.viewModel = ViewModel
    }
    done(null)
  },
  loadViewModel(name, config, done) {
    if (typeof config === 'function') {
      done((params) => {
        const viewModel = new config(params)
        viewModel._calledWith = params
        return viewModel
      }, done)
    } else if (config.createViewModel) {
      done((params, componentInfo) => {
        const viewModel = config.createViewModel(params, componentInfo)
        viewModel._calledWith = params
        return viewModel
      }, done)
    } else {
      done(null)
    }
  }
})

$.fn.getComponentParams = function() {
  return ko.contextFor(ko.virtualElements.firstChild(this.get(0))).$component._calledWith
}

function renderComponent(component, _params = {}, _bindingCtx = {}) {
  const _component = ko.observable('_SUT')
  const $el = $('<div data-bind="_setContext, component: { name: _component, params: _params }"></div>')
  component.synchronous = true

  if (ko.components.isRegistered('_SUT')) {
    ko.components.unregister('_SUT')
  }

  ko.components.register('_SUT', component)
  ko.bindingHandlers._setContext = {
    init(el, valueAccessor, allBindings, viewModel, bindingContext) {
      _.merge(bindingContext, _bindingCtx)
    }
  }

  $('body').html($el)
  ko.applyBindings(_.merge({ _component, _params }), $el.get(0))
  ko.tasks.runEarly()

  ko.components.unregister('_SUT')
  ko.bindingHandlers._setContext = (void 0)

  $el.dispose = function() {
    ko.components.register('_NULL', { template: '<!-- nothing to see here, carry on -->' })
    _component('_NULL')
    ko.tasks.runEarly()
    ko.components.unregister('_NULL')
    $el.remove()
  }

  return $el
}

function renderHtml({ template, viewModel = {} }) {
  let $el
  try { $el = $(template) }
  catch (e) { $el = $('<span />').text(template) }

  $('body').html($el)

  if (typeof viewModel === 'function') {
     ko.applyBindings(new viewModel(), $el.get(0))
  } else {
     ko.applyBindings(viewModel, $el.get(0))
  }

  ko.tasks.runEarly()

  return $el
}

module.exports = { renderComponent, renderHtml }
