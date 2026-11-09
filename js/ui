/* =========================================================
   ui.js — helpers para reduzir repetição nos módulos JS
   ========================================================= */
window.UI = {
  /** Linha "Carregando..." / vazia para <tbody> */
  emptyRow: function (colspan, text) {
    return (
      '<tr><td colspan="' + colspan + '" class="table-empty">' +
      (text || 'Carregando...') +
      '</td></tr>'
    );
  },

  /** <option> 1º..9º Ano prontos */
  seriesOptions: function (selected) {
    var out = '';
    for (var n = 1; n <= 9; n++) {
      var label = n + 'º Ano';
      out += '<option value="' + label + '"' + (label === selected ? ' selected' : '') + '>' + label + '</option>';
    }
    return out;
  },
};
