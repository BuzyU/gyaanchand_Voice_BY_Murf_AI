// backend/weatherService.js - OpenWeather API Integration
const axios = require('axios');

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

// Default location (Pimpri, Maharashtra, IN)
const DEFAULT_LOCATION = {
  lat: 18.6298,
  lon: 73.7997,
  name: 'Pimpri'
};

/**
 * Get current weather for a location
 * @param {string} location - City name or "current" for default location
 * @returns {Object} Weather data
 */
async function getWeather(location = 'current') {
  console.log(`\n🌤️ [WEATHER-API] Fetching weather for: ${location}`);
  
  try {
    let params = {
      appid: OPENWEATHER_API_KEY,
      units: 'metric' // Celsius
    };

    // Use default location if "current" or similar
    if (!location || location.toLowerCase() === 'current' || location.toLowerCase() === 'here') {
      params.lat = DEFAULT_LOCATION.lat;
      params.lon = DEFAULT_LOCATION.lon;
      console.log(`📍 [WEATHER-API] Using default location: ${DEFAULT_LOCATION.name}`);
    } else {
      params.q = location;
      console.log(`📍 [WEATHER-API] Looking up: ${location}`);
    }

    const response = await axios.get(OPENWEATHER_BASE_URL, { 
      params,
      timeout: 5000 
    });

    const data = response.data;
    
    const weatherInfo = {
      location: data.name,
      country: data.sys.country,
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      description: data.weather[0].description,
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      pressure: data.main.pressure,
      visibility: data.visibility / 1000, // Convert to km
      icon: data.weather[0].icon,
      main: data.weather[0].main
    };

    console.log(`✅ [WEATHER-API] Success: ${weatherInfo.location}, ${weatherInfo.temperature}°C, ${weatherInfo.description}`);
    
    return {
      success: true,
      data: weatherInfo,
      message: formatWeatherMessage(weatherInfo)
    };

  } catch (error) {
    console.error(`❌ [WEATHER-ERROR] ${error.message}`);
    
    if (error.response?.status === 404) {
      return {
        success: false,
        error: 'Location not found',
        message: `I couldn't find weather information for "${location}". Could you try a different city name?`
      };
    }
    
    return {
      success: false,
      error: error.message,
      message: 'Sorry, I had trouble getting the weather information. Please try again.'
    };
  }
}

/**
 * Format weather data into natural language
 */
function formatWeatherMessage(weather) {
  const { location, country, temperature, feelsLike, description, humidity, windSpeed } = weather;
  
  // Temperature feeling
  let tempFeeling = '';
  if (temperature < 10) {
    tempFeeling = "It's quite cold";
  } else if (temperature < 20) {
    tempFeeling = "It's cool";
  } else if (temperature < 25) {
    tempFeeling = "It's pleasant";
  } else if (temperature < 30) {
    tempFeeling = "It's warm";
  } else {
    tempFeeling = "It's hot";
  }

  // Build message
  let message = `Currently in ${location}${country ? ', ' + country : ''}, ${tempFeeling} at ${temperature}°C. `;
  
  // Add description
  message += `The weather is ${description}. `;
  
  // Add feels like if different
  if (Math.abs(temperature - feelsLike) >= 3) {
    message += `It feels like ${feelsLike}°C. `;
  }
  
  // Add humidity if notable
  if (humidity > 70) {
    message += `Humidity is high at ${humidity}%. `;
  } else if (humidity < 30) {
    message += `Humidity is low at ${humidity}%. `;
  }
  
  // Add wind if notable
  if (windSpeed > 5) {
    message += `Wind speed is ${windSpeed.toFixed(1)} meters per second.`;
  }
  
  return message.trim();
}

/**
 * Get 5-day forecast (optional feature)
 */
async function getForecast(location = 'current') {
  console.log(`\n📅 [FORECAST-API] Fetching 5-day forecast for: ${location}`);
  
  try {
    let params = {
      appid: OPENWEATHER_API_KEY,
      units: 'metric',
      cnt: 8 // Next 24 hours (3-hour intervals)
    };

    if (!location || location.toLowerCase() === 'current' || location.toLowerCase() === 'here') {
      params.lat = DEFAULT_LOCATION.lat;
      params.lon = DEFAULT_LOCATION.lon;
    } else {
      params.q = location;
    }

    const response = await axios.get(
      'https://api.openweathermap.org/data/2.5/forecast',
      { params, timeout: 5000 }
    );

    const forecasts = response.data.list.slice(0, 4).map(item => ({
      time: new Date(item.dt * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      temp: Math.round(item.main.temp),
      description: item.weather[0].description
    }));

    const message = `Here's the forecast for ${response.data.city.name}: ${
      forecasts.map(f => `${f.time}, ${f.temp}°C with ${f.description}`).join('. ')
    }`;

    console.log(`✅ [FORECAST-API] Success`);
    
    return {
      success: true,
      data: forecasts,
      message
    };

  } catch (error) {
    console.error(`❌ [FORECAST-ERROR] ${error.message}`);
    return {
      success: false,
      error: error.message,
      message: 'Sorry, I had trouble getting the forecast. Please try again.'
    };
  }
}

module.exports = {
  getWeather,
  getForecast
};