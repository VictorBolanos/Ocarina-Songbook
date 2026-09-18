(function (C) {
  'use strict';

  // The fixed-choice categories a song can be filed under. Each song stores one option key per
  // category (or '' for "not set"). To add a category or an option, add it here: the editor, the
  // filters on the home page and the JSON files all read this list.
  var LIST = [
    {
      key: 'difficulty',
      label: 'Dificultad',
      options: [['facil', 'Fácil'], ['media', 'Media'], ['dificil', 'Difícil']]
    },
    {
      key: 'origin',
      label: 'Origen',
      options: [
        ['videojuegos', 'Videojuegos'], ['cine', 'Cine y TV'], ['anime', 'Anime'],
        ['tradicional', 'Tradicional'], ['otras', 'Otras']
      ]
    },
    {
      key: 'status',
      label: 'Estado',
      options: [['por-aprender', 'Por aprender'], ['aprendiendo', 'Aprendiendo'], ['dominada', 'Dominada']]
    }
  ];

  function find(key) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].key === key) return LIST[i];
    return null;
  }

  function isValid(key, value) {
    var category = find(key);
    return !!category && category.options.some(function (option) { return option[0] === value; });
  }

  // Human label of an option key, or '' when the value is not set / unknown.
  function labelOf(key, value) {
    var category = find(key);
    if (!category) return '';
    for (var i = 0; i < category.options.length; i++) {
      if (category.options[i][0] === value) return category.options[i][1];
    }
    return '';
  }

  // Position of an option in its category (for sorting); unset values sort last.
  function rank(key, value) {
    var category = find(key);
    if (!category) return Infinity;
    for (var i = 0; i < category.options.length; i++) {
      if (category.options[i][0] === value) return i;
    }
    return Infinity;
  }

  C.categories = { list: LIST, isValid: isValid, labelOf: labelOf, rank: rank };
})(window.Cancionero = window.Cancionero || {});
