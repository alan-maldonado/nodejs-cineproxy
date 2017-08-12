const express = require('express');
const axios = require('axios');
const _ = require('lodash');

require('dotenv').config({});

const app = express();

app.get('/', (req, res) => {
  res.send({
    hi: 'there',
    links: [
      {
        rel: 'cinemas',
        href: `${process.env.DOMAIN_SERVER}/cinemas`
      }
    ]
  });
});

app.get('/cinemas', async (req, res) => {
  const { data: cities } = await axios.post(process.env.EXTERNAL_API_CINEMAS);
  const hateoas = _.map(cities, city => ({
    complejos: city.Complejos,
    name: city.Nombre,
    key: city.Clave,
    geoX: city.GeoX,
    geoY: city.geoY,
    links: [
      {
        rel: 'self',
        href: `${process.env.DOMAIN_SERVER}/cinemas/${city.Clave}`
      }
    ]
  }));
  const cinemas = _.keyBy(hateoas, 'key');
  res.json(cinemas);
});

const formatFormats = formats => {
  const cleanFormats = _.map(formats, format => ({
    name: format.Name,
    isExperience: format.IsExperience,
    language: format.Language,
    showTimes: format.Showtimes.map(time =>
      time.TimeFilter.replace(/\/Date\((\d+)\)\//gi, '$1')
    )
  }));
  return cleanFormats;
};

const formatMovies = movies => {
  const cleanMovies = _.map(movies, movie => ({
    title: movie.Title,
    key: movie.Key,
    originalTitle: movie.OriginalTitle,
    rating: movie.Rating,
    runTime: movie.RunTime,
    poster: movie.Poster,
    trailer: movie.Trailer,
    formats: formatFormats(movie.Formats)
  }));
  return _.keyBy(cleanMovies, 'key');
};

const formatDates = dates => {
  const schedule = _.map(dates, date => ({
    dateTitle: date.ShowtimeDate,
    movies: formatMovies(date.Movies),
    date: date.FilterDate.replace(/\/Date\((\d+)\)\//gi, '$1')
  }));
  return _.keyBy(schedule, 'date');
};

const scheduleByCityName = async cityKey => {
  const { data: normal } = await axios.post(process.env.EXTERNAL_API_MOVIES, {
    claveCiudad: cityKey,
    esVIP: false
  });
  const { data: vip } = await axios.post(process.env.EXTERNAL_API_MOVIES, {
    claveCiudad: cityKey,
    esVIP: true
  });

  const movies = _.merge(normal.d ? normal : {}, vip.d ? vip : {});
  const hateoas = movies.d.Cinemas.map(cinema => ({
    schedule: formatDates(cinema.Dates),
    name: cinema.Name,
    key: cinema.Key,
    links: [
      {
        rel: 'self',
        href: `${process.env
          .DOMAIN_SERVER}/cinemas/${cinema.CityKey}/${cinema.Key}`
      },
      {
        rel: 'parent',
        href: `${process.env.DOMAIN_SERVER}/cinemas/${cinema.CityKey}`
      }
    ]
  }));

  return _.keyBy(hateoas, 'key');
};

app.get('/cinemas/:cityName', async (req, res) => {
  const cinemas = await scheduleByCityName(req.params.cityName);
  res.json(cinemas);
});

app.get('/cinemas/:cityName/:cinema', async (req, res) => {
  const cinemas = await scheduleByCityName(req.params.cityName);
  const cinema = _.pick(cinemas, req.params.cinema);
  res.json(cinema[req.params.cinema]);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT);
console.log(`http://localhost:${PORT}/`);
