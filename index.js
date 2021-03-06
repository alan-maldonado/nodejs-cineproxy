const express = require('express');
const cors = require('cors');
const axios = require('axios');
const _ = require('lodash');
const moment = require('moment-timezone');
moment.tz.setDefault("Mexico/General");

require('dotenv').config({});

const app = express();

app.use(cors());

const formatFormats = formats => {
  const cleanFormats = _.map(formats, format => ({
    name: format.Name,
    isExperience: format.IsExperience,
    language: format.Language,
    showTimes: format.Showtimes.map(time => moment(parseInt(time.TimeFilter.replace(/\/Date\((\d+)\)\//gi, '$1'), 10)).format('hh:mm A'))
  }));
  return cleanFormats;
};

const formatMovies = (movies, city, cinema) => {
  const cleanMovies = _.map(movies, movie => ({
    title: movie.Title,
    key: movie.Key,
    originalTitle: movie.OriginalTitle,
    rating: movie.Rating,
    runTime: movie.RunTime,
    poster: movie.Poster,
    trailer: movie.Trailer,
    formats: formatFormats(movie.Formats),
    links: [
      {
        rel: 'movie',
        href: `${process.env.DOMAIN_SERVER}/cinemas/${city}/${cinema}/${movie.Key}`
      }
    ]
  }));
  return _.keyBy(cleanMovies, 'key');
};

const formatDates = (dates, city, cinema) => {
  const schedule = _.map(dates, date => ({
    dateTitle: date.ShowtimeDate,
    movies: formatMovies(date.Movies, city, cinema),
    date: date.FilterDate.replace(/\/Date\((\d+)\)\//gi, '$1')
  }));
  return _.keyBy(schedule, 'date');
};

const scheduleByCityName = async cityKey => {
  const {data: normal} = await axios.post(process.env.EXTERNAL_API_MOVIES, {
    claveCiudad: cityKey,
    esVIP: false
  });
  const {data: vip} = await axios.post(process.env.EXTERNAL_API_MOVIES, {
    claveCiudad: cityKey,
    esVIP: true
  });

  const movies = _.merge(normal.d
    ? normal
    : {}, vip.d
    ? vip
    : {});
  const hateoas = movies.d.Cinemas.map(cinema => ({
    schedule: formatDates(cinema.Dates, cinema.CityKey, cinema.Key),
    name: cinema.Name,
    key: cinema.Key,
    links: [
      {
        rel: 'self',
        href: `${process.env.DOMAIN_SERVER}/cinemas/${cinema.CityKey}/${cinema.Key}`
      }, {
        rel: 'parent',
        href: `${process.env.DOMAIN_SERVER}/cinemas/${cinema.CityKey}`
      }
    ]
  }));

  return _.keyBy(hateoas, 'key');
};

const formatLocations = (city, locations) => {
  return _.map(locations, location => ({
    key: location.Clave,
    name: location.Nombre,
    links: [
      {
        rel: 'cinemas',
        href: `${process.env.DOMAIN_SERVER}/cinemas/${city}/${location.Clave}`
      }
    ]
  }));
};

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

app.get('/timezones', (req, res) => {
  res.send(moment.tz.names())
})

app.get('/cinemas', async(req, res) => {
  const {data: cities} = await axios.post(process.env.EXTERNAL_API_CINEMAS);
  const hateoas = _.map(cities, city => ({
    locations: formatLocations(city.Clave, city.Complejos),
    name: city.Nombre,
    key: city.Clave,
    geoX: city.GeoX,
    geoY: city.GeoY,
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

app.get('/cinemas/:cityName', async(req, res) => {
  const cinemas = await scheduleByCityName(req.params.cityName);
  res.json(cinemas);
});

app.get('/cinemas/:cityName/:cinema/all', async(req, res) => {
  const cinemas = await scheduleByCityName(req.params.cityName);
  const cinema = _.pick(cinemas, req.params.cinema);
  res.json(cinema[req.params.cinema]);
});

app.get('/cinemas/:cityName/:cinema', async(req, res) => {
  const cinemas = await scheduleByCityName(req.params.cityName);
  const cinema = _.pick(cinemas, req.params.cinema);
  const currentCinema = cinema[req.params.cinema]
  const [ todayMovies ] = _.map(currentCinema.schedule)
  currentCinema.movies = todayMovies.movies
  res.json(_.omit(currentCinema, 'schedule'));
});

app.get('/cinemas/:cityName/:cinema/:movie', async(req, res) => {
  const cinemas = await scheduleByCityName(req.params.cityName);
  const cinema = _.pick(cinemas, req.params.cinema);
  const currentCinema = cinema[req.params.cinema];
  const [todayMovies] = _.map(currentCinema.schedule);
  currentCinema.movies = todayMovies.movies;
  const movie = todayMovies.movies[req.params.movie];
  res.json(movie);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT);
console.log(`http://localhost:${PORT}/`);
