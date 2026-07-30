<img src="https://cdn.prod.website-files.com/677c400686e724409a5a7409/6790ad949cf622dc8dcd9fe4_nextwork-logo-leather.svg" alt="NextWork" width="300" />

# Build a Ride Booking App MVP

**Project Link:** [View Project](https://nextwork.ai/projects/029596a0-6015-43e0-84ee-660c5061ac56)

**Author:** Okuhle Charlie  
**Email:** charlieokuhle4@gmail.com

---

![Image](https://nextwork.ai/proud_rose_heroic_kangaroo/uploads/029596a0-6015-43e0-84ee-660c5061ac56_h26k6vsq)

## Project Overview

### What this project is about

In this project, I'm building a simplified ride booking app that is similar to Uber using Node.js, Express, MongoDB and Leaflet.js so that I can learn how the frontend, backend and database connect and talk to each other. Making sure the app is interactive and functional.

## Setting Up the Server and Database

### Project setup goals

In this step, I'm setting up the infrastructure/foundation before writing the actual app code. Where Node.js creates a package.json which tracks my project's dependencies, backend packages that handles routing and letting the backend and frontend talk to each other and also a database that will be storing all the data that will entered into the app. So that everything that I build works in a way it suppose to, without having to install packages that I was suppose to build on top off when I already started coding.

### Database choice and connection

I chose the MongoDB and my server connects to it through Mongoose which is a library that is a bridge between MongoDB and Node.js, using the connection string  I got when I connected the cluster as the address and credentials.

![Image](https://nextwork.ai/proud_rose_heroic_kangaroo/uploads/029596a0-6015-43e0-84ee-660c5061ac56_h23qpisa)

## Building the Interactive Map

### Map page goals

In this step, I'm building a user-facing map using html, css and javascript so that users can interact and choose pickup and dropoff spots and reset the pins if they choose an incorrect spot.

![Image](https://nextwork.ai/proud_rose_heroic_kangaroo/uploads/029596a0-6015-43e0-84ee-660c5061ac56_j8jebrla)

### How click state tracking works

The clickState variable tracks which stage of the booking process the user is currently in either pickup, dropoff or done so that each click does the correct action. The first click places the pickup green marker and advances the state to dropff which is the second click and places a red marker and then advances to done which in this state ignores all further clicks until reset is clicked and sets state back to pickup.

## Submitting Ride Requests

### Wiring up the ride request button

In this step, I'm wiring the Request Ride button so that I can see the ride's coordinates and make the request visible on the sidebar.

![Image](https://nextwork.ai/proud_rose_heroic_kangaroo/uploads/029596a0-6015-43e0-84ee-660c5061ac56_86rj5ubo)

### Discovering the vanishing data problem

When I refreshed, the rides coordinates disappeared. This happened because the rides where stored in the browser's JavaScript memory and not in the database.

## Building the REST API and Database Model

### API and model goals

In this step, I'm building a Mongoose Ride model and 2 REST API routes on the express server so that rides can be permanently saved to MongoDB and retrieved back on demand, surviving a page refresh instead of vanishing.

![Image](https://nextwork.ai/proud_rose_heroic_kangaroo/uploads/029596a0-6015-43e0-84ee-660c5061ac56_9tkgbjnb)

### Auto-generated MongoDB fields

The fields that were automatically added include _id which is a unique identifier MongoDB generates for every document, pending status since I didn't explicitly send one in this request. createdAt which is a timestamp to document the moment the ride was created and a version key mongoose adds internally to track document modifications.

## Connecting Frontend to Backend for Persistent Rides

### Integration goals

In this step, I'm connecting the frontend map/button to the backend API using Fetch API so that rides actually get saved to MongoDB when requested and reload automatically from the database everytime the page refreshes and stay visible on the sidebar instead of vanishing

### How fetch bridges frontend and backend

The frontend uses fetch to awnd pickup and dropoff coordinates to the /api/rides POST route whem "Request Ride" is clicked and to retrieve saved rides from the /api/rides GET route. When the page loads, it automatically calls loadRides(), which fetches every saved ride from MongoDB and displays each one in the sidebar list and as markers on the map, so rides persist accross refreshes instead of disappearing.

## Bonus: Building the Driver Dashboard

![Image](https://nextwork.ai/proud_rose_heroic_kangaroo/uploads/029596a0-6015-43e0-84ee-660c5061ac56_q6kubbvd)

### Real-time communication between driver and rider

In this project extension, the driver dashboard uses a PATCH request tp /api/rides/:id to update ride status in MongoDB when Accept or Complete is clicked, and the rider page finds out about that change only by independently polling or refreshing /api/rides - the two pages never communicate  directly, they just both read from and write to the same shared database.

## Reflections and Key Takeaways

### Tools and concepts learned

The key tools I used include Node.js, Express, MongoDB Atlas, Mongoose, Leaflet.js, HTML, CSS and JavaScript. Key concepts I learnt include the three-layer full stacl architecture, building REST API routes, data persistence versus browser-memory-only storage, schema-based data modeling and validation with Mongoose, async/await for handling asynchronous requests, using state variables (like clickState) to control UI behavior, and polling to keep independent clients (rider and driver pages) in sync through a shared database rather than direct communication.

### Time and challenges

This project took me approximately 2 days as I was doing 3 steps a day. The most challenging part was trying to figure out how to connect the mongodb connection string to vs code and ensuring the connection works.

### Looking ahead

I did this project today to learn how to connect the frontend to the backend while everything gets stored in the database. Another skill I want to learn is python.

---

*Built with [NextWork](https://nextwork.ai) - [View this project](https://nextwork.ai/projects/029596a0-6015-43e0-84ee-660c5061ac56)*
