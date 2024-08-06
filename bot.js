const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');

// Your Discord Bot Token
const TOKEN = 'your bot token';

// Your Discord Channel ID
const CHANNEL_ID = '1270049435652722741';

// Airports to monitor
const MONITORED_AIRPORTS = ['OJAI', 'ORBI', 'OJAM'];

// Create a new client instance with the correct intents
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let lastChecked = new Date();
let cachedData = null;
let cacheTimestamp = null;
const CACHE_DURATION_MS = 2 * 60 * 1000; // 2 minutes

// Fetch flight data from IVAO API
async function fetchFlightData() {
    try {
        console.log('Fetching flight data...');
        const response = await axios.get('https://api.ivao.aero/v2/tracker/whazzup');
        console.log('Fetched flight data:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error fetching flight data:', error);
        return null;
    }
}

// Parse flight data to extract departures and arrivals
function parseFlightData(data) {
    if (!data || !data.clients || !data.clients.pilots) {
        console.error('Invalid data structure:', data);
        return [];
    }
    
    const flights = data.clients.pilots;
    console.log(`Parsed flight data: ${flights.length} flights`);
    
    return flights.map(flight => ({
        id: flight.callsign,
        aircraft: flight.aircraft,
        departure: flight.flightPlan?.departureId || 'Unknown',
        arrival: flight.flightPlan?.arrivalId || 'Unknown'
    })).filter(flight => MONITORED_AIRPORTS.includes(flight.departure) || MONITORED_AIRPORTS.includes(flight.arrival));
}

// Monitor flights and send messages to Discord
async function monitorFlights() {
    const now = new Date();
    
    if (!cachedData || !cacheTimestamp || (now - cacheTimestamp > CACHE_DURATION_MS)) {
        cachedData = await fetchFlightData();
        cacheTimestamp = now;
    }

    if (!cachedData) {
        console.error('No data received from API');
        return;
    }
    
    const flights = parseFlightData(cachedData);

    flights.forEach(flight => {
        const departureTime = new Date(flight.departure);
        const arrivalTime = new Date(flight.arrival);

        if (departureTime > lastChecked) {
            console.log(`Sending departure message for flight ${flight.aircraft}`);
            client.channels.cache.get(CHANNEL_ID).send(`New departure: ${flight.aircraft} from ${flight.departure}`);
        }

        if (arrivalTime > lastChecked) {
            console.log(`Sending arrival message for flight ${flight.aircraft}`);
            client.channels.cache.get(CHANNEL_ID).send(`New arrival: ${flight.aircraft} at ${flight.arrival}`);
        }
    });

    lastChecked = now;
}

// On bot ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('Bot is now online!');

    // Schedule the flight monitoring to run every 5 minutes
    cron.schedule('*/5 * * * *', () => {
        monitorFlights();
    });
});

// On message create (example command to get current flights)
client.on('messageCreate', async message => {
    if (message.content === '!flights') {
        console.log('Received !flights command');
        
        if (!cachedData || !cacheTimestamp || (new Date() - cacheTimestamp > CACHE_DURATION_MS)) {
            cachedData = await fetchFlightData();
            cacheTimestamp = new Date();
        }
        
        if (!cachedData) {
            message.channel.send('Error fetching flight data.');
            return;
        }
        
        const flights = parseFlightData(cachedData);
        
        let response = 'Current flights:\n';
        flights.forEach(flight => {
            response += `${flight.aircraft} from ${flight.departure} to ${flight.arrival}\n`;
        });

        message.channel.send(response);
    }
});

// Login to Discord
client.login(TOKEN);
