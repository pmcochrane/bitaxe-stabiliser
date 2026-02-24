# Bitaxe Stabiliser

A web-based Bitaxe monitoring and control application. The application automatically adjusts the ASIC frequency to maintain a target temperature for either the ASIC chip or voltage regulator (whichever is the limiting factor). 

It also includes sweep mode for finding optimal frequency/voltage settings for a device.

## Features

- **Temperature Stabilisation**: Automatically adjusts ASIC frequency to maintain target temperature
- **Real-time Monitoring**: View hashrate, temperature, voltage, power, and efficiency in real-time
- **Historical Data**: Store and visualize historical performance data
- **Sweep Mode**: Test different frequency/voltage combinations to find optimal settings
- **Hashrange Analysis**: Analyze sweep results to identify best configurations for different use cases

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts
- **Backend**: Express + TypeScript
- **API Client**: Axios

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BITAXE_IP` | IP address of the Bitaxe (required) | - |
| `BITAXE_HOSTNAME` | Hostname for data folder | Falls back to IP |
| `TARGET_ASIC` | Target ASIC temp (°C) | 65 |
| `MAX_VR` | Max VR temp (°C) | 80 |
| `CORE_VOLTAGE` | Core voltage (mV) | 1150 |
| `MAX_FREQ` | Max frequency (MHz) | 525 |
| `PORT` | Server port | 3000 |
| `HISTORY_LIMIT` | Max history entries | 172800 |

## Running the Application in Docker
Create a docker-compose.yml file. You only need to specify a BITAXE_IP environment variable.
```yaml
version: '3.8'

services:
  bitaxe-stabiliser-1:
    image: bitaxe-stabiliser
    ports:
      - "3000:3000"
    environment:
      - BITAXE_IP=192.168.1.100
      # - BITAXE_HOSTNAME=bitaxe001
      # - TARGET_ASIC=65
      # - MAX_VR=80
      # - CORE_VOLTAGE=1150
      # - MAX_FREQ=525.0
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### Build the docker image image
```bash
docker build -t bitaxe-stabiliser .
```

Then build and run the image using the following command:
```bash
docker-compose up -d
```

### Data Storage Volume
The application stores data in a volume mounted at `./data` on the host. This will include several files in a folder named after the bitaxe hostname or IP address if the hostname cannot be determined from the bitaxe's API.

These files & settings will persist between docker sessions if you mount a volume as indicated in the docker compose file above.

- `settings.json` - Application settings
- `history.json` - Historical performance data
- `hashrange.json` - Sweep mode results
- `events.json` - System events log

### Running Directly with Docker
You can build and control the docker image without a docker compose file if you wish.
```bash
# Build the image
docker build -t bitaxe-stabiliser .

# Run the container
docker run -d \
  -p 3000:3000 \
  -e BITAXE_IP=192.168.1.100 \
  -v $(pwd)/data:/app/data \
  bitaxe-stabiliser
```

### Development Mode

```bash
# Install dependencies
npm install

# Run both frontend and backend
npm run dev

# Or run backend only
npm run dev:all
```

- Frontend runs on http://localhost:5173
- Backend API runs on http://localhost:3000

## Application Pages

### Dashboard

The main page shows:

- Current mining statistics (hashrate, temperature, power, etc.)
- Stabiliser controls (on/off)
- Manual frequency/voltage controls
- Real-time performance graph
- Sweep mode progress indicator
- Hashrange analysis tool

### History

Historical data view with:

- Paginated table of all readings
- Date range navigation
- CSV export functionality
- Column sorting

## Sweep Mode

Sweep mode tests different frequency settings to build a performance profile:

1. Starts at stepDown = -24 (lowest frequency)
2. Increments through each step level (600 iterations each)
3. Records hash rate at each frequency
4. Builds a "hashrange" profile
5. Stops automatically when reaching stepDown = 0

After a sweep, use "Analyse Hashrange" to find optimal settings for:

- Maximum hash rate
- Minimum power consumption
- Minimum ASIC temperature
- Minimum VR temperature
- Best efficiency
