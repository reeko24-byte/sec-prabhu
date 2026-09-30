/* GPS, and the place name that goes into the photo overlay.
 *
 * Position matters here in a different way than the KP does. The KP is the
 * survey's own coordinate system and is what the report is written in; the
 * latitude and longitude are corroboration, burned into the photograph so an
 * image that leaves the phone carries its own place and time.
 *
 * Because the address is only ever burned into pixels at the moment of capture,
 * there is no backfill: a name that arrives an hour later cannot be added to a
 * photograph that has already been written. With no signal the photo simply
 * carries one line fewer, which is the honest result.
 */

(function (SA) {
  var ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

  /* Nominatim's usage policy allows at most one request a second. A survey is
     nowhere near that, but the gap costs nothing and keeps the app a good
     citizen of a free service. */
  var MIN_GAP_MS = 1200;
  var lastCallAt = 0;

  function throttle() {
    var wait = Math.max(0, lastCallAt + MIN_GAP_MS - Date.now());
    lastCallAt = Date.now() + wait;
    return new Promise(function (resolve) { setTimeout(resolve, wait); });
  }

  /* OpenStreetMap returns the bare name — "Bathin Solapan", "Bengkalis" — while
     a report writes "Kecamatan Bathin Solapan", "Kabupaten Bengkalis". Add the
     level's title unless the name already carries one. */
  function titled(value, title) {
    if (!value) return '';
    /* Some Indonesian areas are tagged in OSM with an English suffix
       ("Kampar Regency", "Dumai City"). Left alone that becomes "Kabupaten
       Kampar Regency", so drop it before adding the title. */
    var name = String(value).replace(/\s+(Regency|City|District|Subdistrict)$/i, '').trim();
    return /^(kecamatan|kabupaten|kota|kelurahan|desa|distrik)\b/i.test(name)
      ? name
      : title + ' ' + name;
  }

  /**
   * Maps Nominatim's address object onto the four parts of the overlay line.
   *
   * Indonesian administrative levels land in different Nominatim keys depending
   * on how the area was tagged, so each part takes the first key with anything
   * in it.
   */
  function mapAddress(address) {
    if (!address) return null;

    function first() {
      for (var i = 0; i < arguments.length; i++) {
        var value = address[arguments[i]];
        if (value) return String(value);
      }
      return '';
    }

    /* A kota is a city-level regency, not a kabupaten, so which key matched
       decides the title. */
    var regency = address.county
      ? titled(String(address.county), 'Kabupaten')
      : address.city
        ? titled(String(address.city), 'Kota')
        : first('state_district');

    return {
      street: first('road', 'pedestrian', 'footway'),
      subDistrict: titled(first('village', 'suburb', 'hamlet', 'neighbourhood', 'quarter'), 'Desa'),
      district: titled(first('city_district', 'municipality', 'subdistrict', 'town'), 'Kecamatan'),
      regency: regency
    };
  }

  SA.geo = {

    /**
     * Starts a continuous fix, reporting every update including failures.
     *
     * Reports a state, never a sentence — the wording belongs to the screen,
     * which is the only part that knows which language is showing.
     */
    watch: function (onUpdate) {
      if (!navigator.geolocation) {
        onUpdate({ state: 'unsupported' });
        return function () {};
      }
      var id = navigator.geolocation.watchPosition(
        function (position) {
          onUpdate({
            state: 'ok',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        function (error) {
          onUpdate({
            state: error.code === error.PERMISSION_DENIED ? 'denied' : 'waiting'
          });
        },
        // maximumAge 0, because a cached fix from the previous KP would
        // be burned into this photograph a few hundred metres away.
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
      return function () { navigator.geolocation.clearWatch(id); };
    },

    /**
     * Resolves to the address parts, or null when the lookup could not be made.
     *
     * Null means "no name available"; the caller burns one line fewer.
     */
    reverse: function (latitude, longitude) {
      if (!navigator.onLine) return Promise.resolve(null);
      return throttle().then(function () {
        var url = ENDPOINT +
          '?format=jsonv2&addressdetails=1&zoom=18' +
          '&lat=' + encodeURIComponent(latitude) +
          '&lon=' + encodeURIComponent(longitude);
        // The route has poor signal; without a deadline a request can hang for
        // minutes with the operator standing on the ROW waiting.
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 12000);
        return fetch(url, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
          })
          .then(function (data) { return mapAddress(data && data.address); })
          .catch(function () { return null; })
          .then(function (result) { clearTimeout(timer); return result; });
      });
    },

    /** The single address line burned into the photograph. */
    addressText: function (address) {
      if (!address) return '';
      return [address.street, address.subDistrict, address.district, address.regency]
        .filter(function (part) { return part && String(part).trim(); })
        .join(', ');
    }
  };
}(window.SA));
