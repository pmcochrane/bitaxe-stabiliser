# Bitaxe Stabiliser

A web-based Bitaxe monitoring and control application. The application automatically adjusts the ASIC frequency to maintain a target temperature for either the ASIC chip or voltage regulator (whichever is the limiting factor).

## DISCLAIMER

**This software is capable of severly overclocking or underclocking your bitaxe hardware. This could lead to damaging your bitaxe device and/or your power supply. Use at your own risk**. The application cannot be held responsibly for any breakages and ultimately, if you are running this software, you are the responsible party if anything breaks.

**Running this application on a Bitaxe with the stock cooler and stock power supply is probably not a good idea**.

## Features

- **Temperature Stabilisation**: Automatically adjusts ASIC frequency to maintain target temperature
- **Real-time Monitoring**: View hashrate, temperature, voltage, power, and efficiency in real-time
- **Historical Data**: Store and visualize historical performance data
- **Sweep Mode**: Test different frequency/voltage combinations to find optimal settings
- **Hashrange Analysis**: Analyze sweep results to identify best configurations for different use cases

## How it works

Firstly choose your desired core voltage and frequency to run your device at. These should be chosen to suit your individual hardware and the room the device is run in. Enter these on the dashboard screen and save the settings. Your device will start hashing at the hash rate according to your chosen frequency.

Next choose how hot you want to drive your ASIC CHIP and enter the **Target ASIC** value. The bitaxe UI indicates that over 70 is quite hot. Ensure you have adequate cooling.

Choose hot hot you want to drive your voltage regulator and enter the **Max VR** value. The bitaxe UI does not offer an opinion on any maximum but personal findings is that 90 or above is possible with adequate cooling in place.

Note that overclocking you device will greatly increase it's power requirements. The value reported in the UI is normally lower than the actual power draw so you need to be careful you are using an appropriate power supply.

The application works by increasing or reducing the frequency of your bitaxe until it can stabilise your ASIC temperature to around the value specified in **Target ASIC**. Over time the device will gravitate towards that value (unless your setting are unrealistic and cannot be attained).

The VR temp is constantly monitored and if it raises above the value specified in **Max VR** the frequency will be stepped down to cool it back down to a workable level.

In case of extreme over temperature conditions the frequency will be heavily stepped down rapidly cooling both chips.

The frequency range can be stepped down as far as required (probably to 0). There is a limit of +5 so at a maximum it will run your device 5 * 6.25MHz = 31.25MHz faster than your specified **Max Freq** setting.

There is a correlation between core voltage and frequency. Higher frequencies can only be obtained by raising core voltage and you really need to set an approriate core voltage to match your desired choice of frequency. There is a **to expected** value displayed in the UI which basically shows how close your actual hash rate is to the estimated hash rate. This value should be close to 0%. I have found that inappropriate core voltage is usually the cause for not attaining the expected hash rate and it is usually too low.

However, raising the core voltage raises the chip temperatures & power consumption so it is important to find the sweet spot for your device - you want to have just enough core voltage to hash to the expected hash rate at that particular frequency.

Your chosen **Max Freq** value should be chosen to match your environment. If the device is in a temperature controlled environment this should be easy to find. In the real world, rooms get colds at night and warm during the day. **Bitaxe Stabiliser** will automatically throttle or speed up your device to compensate for fluculations. As the room gets warmer (sunshine or heating on) then the frequency will step down.

The end result is hopefully a relatively constant ASIC & voltage regulator temperatue. This leads to a relatively constant hash rate. You can monitor both chip temperatures and the applied frequency stepping in the graphs in the UI. You can also view the hash rate.

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts
- **Backend**: Express + TypeScript
- **API Client**: Axios

## Running the Application in Docker

The simplest way to get **Bitaxe Stabiliser** running is to use docker to run the image. Follow the instruction on the docker web site to install docker on your system.

Clone the **Bitaxe Stabiliser** github repository and edit the '''docker-compose.yml''' file.

The only required configuration is setting the **BITAXE_IP** environment variable which points the application to read the api from a bitaxe at that IP address.

You can select any port to run the server on. By default it is port 3001 but you can change this by editing the ports line to be **- "1234:3000"** to run on locahost:1024. When the docker service is started, navigate to <http://localhost:3001> and you will see the **Bitaxe Stabiliser** UI.

The data volume is required to persist your settings between restarts. By default, all settings and data will be stored in a **data** folder where the **docker-compose.yml** files is located.
In **data**, you should find a subfolder for each bitaxe you point the application to monitor.

If you have more than one bitaxe, you can add multiple instances of the application each pointing to a different BITAXE_IP address. Copy the entire block (bitaxe-stabiliser-1) and paste it below and ensure the indentaion is the same.
Rename the second service to bitaxe-stabiliser-2 and select a different port for the second UI instance.
You can host as many instances of **Bitaxe Stabiliser** as your computer can handle. I would be surprised is an ancient PC could not support dozens of instances.

To start all your instances execute the command

```yaml
docker compose up -d --build --remove-orphans
```

Example **docker-compose.yml** file:

```yaml
services:
  bitaxe-stabiliser-1:
    image: bitaxe-stabiliser
    environment:
      - BITAXE_IP=192.168.1.100
    ports:
      - "3001:3000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

## Environment Variables

There are other environment variable that can be set in your config file. There is no need to pass these as the will default to match your current bitaxe settings and any changes you make will persist between restarts (because of data volume).

| Variable | Description | Default |
| -------- | ----------- | ------- |
| BITAXE_IP | IP address of the Bitaxe (required) | |
| BITAXE_HOSTNAME | Hostname for data folder | Falls back to IP if bitaxe API does not return a value |
| TARGET_ASIC | Target ASIC temp (°C) | 65 |
| MAX_VR | Max VR temp (°C) | 80 |
| CORE_VOLTAGE | Core voltage (mV) | Normally inherits current bitaxe setting (else 1150) |
| MAX_FREQ | Max frequency (MHz) | Normally inherits current bitaxe setting (else 525) |
| PORT | Server port | 3000 |
| HISTORY_LIMIT | Max history entries | 172800 (2 days worth of data) |
| STEP_DOWN_DEFAULT | Default Stepdown value | applied at server startup |

## Building the docker image manually

If you are so inclined, you can manually build a docker image for yourself. Docker compose is the easiest way to run the image.

You can build and control the docker image without a docker compose file if you wish. Consult the docker documentation if you want to know more about running from the command line.

```bash
# Build the image
docker build -t bitaxe-stabiliser .

# Run the container
docker run -d \
  -p 3001:3000 \
  -e BITAXE_IP=192.168.1.100 \
  -v $(pwd)/data:/app/data \
  bitaxe-stabiliser
```

## Data Storage Volume

The application stores data in a volume mounted at `./data` on the host. This will include several files in a folder named after the bitaxe hostname or IP address if the hostname cannot be determined from the bitaxe's API.

These files & settings will persist between docker sessions if you mount a volume as indicated in the docker compose file above.

- `settings.json` - Application settings
- `history.json` - Historical performance data
- `hashrange.json` - Sweep mode results
- `events.json` - System events log

## Development Mode

If you want to run this application in development mode, you can start a server with the following commands.

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

- Frontend runs on <http://localhost:5173>
- Backend API runs on <http://localhost:3000>

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

Sweep mode tests different frequency settings to build a performance profile. Firstly set your desired core voltage and max frequency settings. These should be around about (or slightly above) where you would normally run your bitaxe.

Note that being over optimistic may cause your bitaxe to overheat (quickly). Please use caution and be conservative until you dicover what you particular bitaxe / power supply is capable of. Bitaxes are very good at detecting overheating before damaging the board but it cannot control your power supply. To high a frequency / core voltage and your power supply may pop. **YOU SHOULD NOT BE RUNNING A BITAXE AT 36W on a 40W POWER SUPPLY**. Look up the 80% rule if you are unsure about what this is.

1. Starts at stepDown = -24 (lowest frequency)
2. Increments through each step level (600 iterations each)
3. Records hash rate at each frequency
4. Builds a "hashrange" profile
5. Stops automatically when reaching stepDown = 0

After a sweep is complete, use "Analyse Hashrange" to view the findings for your device:

- Maximum hash rate
- Minimum power consumption
- Minimum ASIC temperature
- Minimum VR temperature
- Best efficiency

The table will indicate the top 5 results for each field for a particular core voltage and frequency. Choose whatever values you like to meet your personal needs from your bitaxe mining.

## Donations

This software is provided by myself to the open source community and is something that I have built for my own use in my own free time. My aim for this software was to run my bitaxes hot to provide ambient supplementary heating for my office on colder days. Higher hash rate are also good in my opinion :)

If you find yourself using this software, like it and feel like give something back then I have left a bitcoin address in the UI that you are welcome to send any donations as thanks. Anything will be much appreciated and unexpected. I hope you like this application. If you don't then that is also fine but don't moan to me about it!
