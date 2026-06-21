/**
 * Mor Kalender — vejr + el-pris modul
 * Kilder: open-meteo.com (vejr, gratis, ingen API-nøgle)
 *         nominatim.openstreetmap.org (geocoding, gratis)
 *         elprisenligenu.dk (el-pris DK1, gratis, ingen API-nøgle)
 */
(function () {
  "use strict";

  var LOCATIONS = (window.MOR_CONFIG && window.MOR_CONFIG.weatherLocations) || [
    { id: "langeland", name: "Langeland", address: "Botoften 5, Langeland, Danmark" },
    { id: "nyborgvej", name: "Nyborgvej",  address: "Nyborgvej 166A, Svendborg, Danmark" }
  ];

  var CACHE_NS    = "mor_wx_";
  var GEO_TTL     = 30 * 24 * 60 * 60 * 1000;
  var WEATHER_TTL = 30 * 60 * 1000;

  var WMO = {
    0:  { text: "Klart",           icon: "☀️" },
    1:  { text: "Næsten klart",    icon: "🌤️" },
    2:  { text: "Delvis skyet",    icon: "⛅" },
    3:  { text: "Overskyet",       icon: "☁️" },
    45: { text: "Tåge",            icon: "🌫️" },
    48: { text: "Rimtåge",         icon: "🌫️" },
    51: { text: "Let dryp",        icon: "🌦️" },
    53: { text: "Dryp",            icon: "🌦️" },
    55: { text: "Kraftigt dryp",   icon: "🌧️" },
    61: { text: "Let regn",        icon: "🌧️" },
    63: { text: "Regn",            icon: "🌧️" },
    65: { text: "Kraftig regn",    icon: "🌧️" },
    71: { text: "Let sne",         icon: "🌨️" },
    73: { text: "Sne",             icon: "❄️" },
    75: { text: "Kraftig sne",     icon: "❄️" },
    77: { text: "Snebyger",        icon: "🌨️" },
    80: { text: "Regnbyger",       icon: "🌦️" },
    81: { text: "Byger",           icon: "🌧️" },
    82: { text: "Kraftige byger",  icon: "⛈️" },
    85: { text: "Snebyger",        icon: "🌨️" },
    86: { text: "Tunge snebyger",  icon: "❄️" },
    95: { text: "Torden",          icon: "⛈️" },
    96: { text: "Torden + hagl",   icon: "⛈️" },
    99: { text: "Kraftig torden",  icon: "⛈️" }
  };

  function wmoDesc(code) {
    var c = parseInt(code, 10);
    return WMO[c] || WMO[Math.floor(c / 10) * 10] || { text: "Vejr", icon: "🌡️" };
  }

  function cacheGet(key) {
    try {
      var raw = localStorage.getItem(CACHE_NS + key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() > obj.exp) { localStorage.removeItem(CACHE_NS + key); return null; }
      return obj.v;
    } catch (e) { return null; }
  }

  function cacheSet(key, value, ttl) {
    try {
      localStorage.setItem(CACHE_NS + key, JSON.stringify({ v: value, exp: Date.now() + ttl }));
    } catch (e) { /* ignorerer fuld localStorage */ }
  }

  function safeFetch(url, options) {
    return new Promise(function (resolve, reject) {
      var timeoutId = setTimeout(function () {
        reject(new Error("Netværk timeout (10 sek)"));
      }, 10000);

      fetch(url, options || {})
        .then(function (resp) {
          clearTimeout(timeoutId);
          resolve(resp);
        })
        .catch(function (err) {
          clearTimeout(timeoutId);
          reject(err);
        });
    });
  }

  function geocode(location) {
    var cached = cacheGet("geo_" + location.id);
    if (cached) return Promise.resolve(cached);

    var params = new URLSearchParams({
      format: "json",
      limit: "1",
      countrycodes: "dk",
      q: location.address
    });
    var url = "https://nominatim.openstreetmap.org/search?" + params.toString();

    return safeFetch(url, { headers: { "User-Agent": "MorKalender/1.0" } })
      .then(function (resp) {
        if (!resp.ok) throw new Error("Geocoding HTTP " + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) {
          throw new Error("Adresse ikke fundet: " + location.address);
        }
        var lat = parseFloat(data[0].lat);
        var lon = parseFloat(data[0].lon);
        if (!isFinite(lat) || !isFinite(lon)) throw new Error("Ugyldige koordinater");
        var coords = { lat: lat, lon: lon };
        cacheSet("geo_" + location.id, coords, GEO_TTL);
        return coords;
      });
  }

  function fetchWeather(lat, lon) {
    var key = "wx_" + lat.toFixed(2) + "_" + lon.toFixed(2);
    var cached = cacheGet(key);
    if (cached) return Promise.resolve(cached);

    var params = new URLSearchParams({
      latitude:      lat.toFixed(4),
      longitude:     lon.toFixed(4),
      current:       "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
      daily:         "temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum",
      timezone:      "Europe/Copenhagen",
      forecast_days: "2"
    });
    var url = "https://api.open-meteo.com/v1/forecast?" + params.toString();

    return safeFetch(url)
      .then(function (resp) {
        if (!resp.ok) throw new Error("Open-Meteo HTTP " + resp.status);
        return resp.json();
      })
      .then(function (data) {
        var cur = data.current;
        var daily = data.daily;

        if (!cur || !daily) throw new Error("Uventet vejr-format");

        var nowDesc = wmoDesc(cur.weather_code);
        var d0desc  = wmoDesc(daily.weather_code[0]);
        var d1desc  = wmoDesc(daily.weather_code[1]);

        var result = {
          temp:   Math.round(cur.temperature_2m),
          feels:  Math.round(cur.apparent_temperature),
          wind:   Math.round(cur.wind_speed_10m),
          text:   nowDesc.text,
          icon:   nowDesc.icon,
          today: {
            max:  Math.round(daily.temperature_2m_max[0]),
            min:  Math.round(daily.temperature_2m_min[0]),
            rain: parseFloat((daily.precipitation_sum[0] || 0)).toFixed(1),
            text: d0desc.text,
            icon: d0desc.icon
          },
          tomorrow: {
            max:  Math.round(daily.temperature_2m_max[1]),
            min:  Math.round(daily.temperature_2m_min[1]),
            rain: parseFloat((daily.precipitation_sum[1] || 0)).toFixed(1),
            text: d1desc.text,
            icon: d1desc.icon
          },
          fetchedAt: Date.now()
        };

        cacheSet(key, result, WEATHER_TTL);
        return result;
      });
  }

  function getWeatherForAll() {
    return Promise.all(LOCATIONS.map(function (loc) {
      return geocode(loc)
        .then(function (coords) { return fetchWeather(coords.lat, coords.lon); })
        .then(function (wx) {
          return Object.assign({}, wx, { name: loc.name, address: loc.address });
        });
    }));
  }

  function fetchElPrices() {
    var now = new Date();
    var dateStr = now.toISOString().slice(0, 10);
    var cached = cacheGet("el_" + dateStr);
    if (cached) return Promise.resolve(cached);

    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    var url = "https://www.elprisenligenu.dk/api/v1/prices/" + y + "/" + m + "-" + d + "_DK1.json";

    return safeFetch(url)
      .then(function (resp) {
        if (!resp.ok) throw new Error("El-pris API HTTP " + resp.status);
        return resp.json();
      })
      .then(function (raw) {
        if (!Array.isArray(raw) || raw.length === 0) throw new Error("Tom el-pris respons");

        var hour = now.getHours();
        var hours = raw
          .map(function (entry) {
            var h = new Date(entry.time_start).getHours();
            var p = typeof entry.DKK_per_kWh === "number" ? entry.DKK_per_kWh : null;
            return p !== null ? { hour: h, price: p } : null;
          })
          .filter(Boolean);

        if (!hours.length) throw new Error("Ingen gyldige priser");

        var prices   = hours.map(function (h) { return h.price; });
        var current  = (hours.find(function (h) { return h.hour === hour; }) || hours[hours.length - 1]).price;
        var avg      = prices.reduce(function (a, b) { return a + b; }, 0) / prices.length;
        var minP     = Math.min.apply(null, prices);
        var maxP     = Math.max.apply(null, prices);
        var cheapest = hours.reduce(function (a, b) { return a.price < b.price ? a : b; });

        var rating = "normal";
        if (current <= avg * 0.8)  rating = "billig";
        else if (current >= avg * 1.3) rating = "dyr";

        var result = {
          current:      +current.toFixed(2),
          avg:          +avg.toFixed(2),
          min:          +minP.toFixed(2),
          max:          +maxP.toFixed(2),
          cheapestHour: cheapest.hour,
          rating:       rating,
          hours:        hours,
          zone:         "DK1",
          fetchedAt:    Date.now()
        };

        var midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        cacheSet("el_" + dateStr, result, midnight.getTime() - now.getTime());
        return result;
      });
  }

  window.MOR_WEATHER = {
    getWeatherForAll: getWeatherForAll,
    fetchElPrices:    fetchElPrices,
    LOCATIONS:        LOCATIONS
  };
})();
