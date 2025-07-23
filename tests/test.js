const ChimeraCache = require('../main/ChimeraCache');

(async function main(){

  const Cache = new ChimeraCache();

  function randomInterval() {
    return Math.floor(Math.random() * 10000);
  }


  const data = {
      "users": [
        {
          "id": 1,
          "name": "Alice Johnson",
          "email": "alice.johnson@example.com",
          "roles": ["admin", "editor"],
          "address": {
            "street": "123 Main St",
            "city": "Metropolis",
            "state": "NY",
            "zip": "10001"
          },
          "settings": {
            "theme": "dark",
            "notifications": true,
            "language": "en"
          },
          "projects": [
            {
              "projectId": "p1",
              "name": "Analytics Dashboard",
              "status": "active"
            },
            {
              "projectId": "p2",
              "name": "Marketing Campaign",
              "status": "archived"
            }
          ]
        },
        {
          "id": 2,
          "name": "Bob Smith",
          "email": "bob.smith@example.com",
          "roles": ["viewer"],
          "address": {
            "street": "456 Maple Ave",
            "city": "Gotham",
            "state": "CA",
            "zip": "90001"
          },
          "settings": {
            "theme": "light",
            "notifications": false,
            "language": "fr"
          },
          "projects": [
            {
              "projectId": "p3",
              "name": "Customer Support Portal",
              "status": "active"
            }
          ]
        },
        {
          "id": 3,
          "name": "Charlie Lee",
          "email": "charlie.lee@example.com",
          "roles": ["editor"],
          "address": {
            "street": "789 Oak Dr",
            "city": "Star City",
            "state": "TX",
            "zip": "73301"
          },
          "settings": {
            "theme": "dark",
            "notifications": true,
            "language": "es"
          },
          "projects": [
            {
              "projectId": "p4",
              "name": "Internal Wiki",
              "status": "in-progress"
            },
            {
              "projectId": "p5",
              "name": "Onboarding Flow",
              "status": "active"
            },
            {
              "projectId": "p6",
              "name": "Design System",
              "status": "planning"
            }
          ]
        }
      ],
      "metadata": {
        "totalUsers": 3,
        "timestamp": "2025-07-23T14:00:00Z",
        "server": "api.example.com"
      }
    };
  
  
  setInterval(() => {

    setInterval(() => {
      Cache.set(`${Math.floor(Math.random() * 9999999)}`, data);
    }, randomInterval());

    setInterval(() => {
      Cache.set(`${Math.floor(Math.random() * 9999999)}`, data);
    }, randomInterval())

    setInterval(() => {
      Cache.set(`${Math.floor(Math.random() * 9999999)}`, data);
    }, randomInterval())

  }, 5000)

})()