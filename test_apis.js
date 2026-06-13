const app = require('./app');
const http = require('http');

let server;

function startServer() {
  return new Promise((resolve) => {
    // Start server on a test port 3001
    server = app.listen(3001, () => {
      console.log('Test server successfully started on port 3001');
      resolve();
    });
  });
}

function stopServer() {
  if (server) {
    server.close(() => {
      console.log('Test server stopped');
    });
  }
}

async function runTests() {
  await startServer();
  
  try {
    // Test 1: Health Check
    console.log('\n--- Test 1: Health Check ---');
    let res = await fetch('http://localhost:3001/');
    let data = await res.json();
    console.log('Status:', res.status);
    console.log('Response Data:', data);

    // Test 2: Webhook Verification (Success)
    console.log('\n--- Test 2: Webhook Verification (Success) ---');
    const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
    res = await fetch(`http://localhost:3001/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=VERIFY_SUCCESS_CHALLENGE`);
    data = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', data);

    // Test 3: Webhook Verification (Failure)
    console.log('\n--- Test 3: Webhook Verification (Failure) ---');
    res = await fetch(`http://localhost:3001/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=VERIFY_FAIL`);
    console.log('Status:', res.status);

    // Test 4: Get Leads (Database check)
    console.log('\n--- Test 4: Get Leads (Database Check) ---');
    res = await fetch('http://localhost:3001/api/leads');
    data = await res.json();
    console.log('Status:', res.status);
    console.log('Data success flag:', data.success);
    console.log('Leads count:', data.leads ? data.leads.length : 'N/A');

    // Test 5: Webhook Event Notification (Mock)
    console.log('\n--- Test 5: Webhook Event Notification (Mock Payload) ---');
    const mockPayload = {
      object: 'page',
      entry: [{
        id: 'page_id_123',
        time: 123456789,
        changes: [{
          field: 'leadgen',
          value: {
            leadgen_id: 'mock_lead_123',
            page_id: 'mock_page_123'
          }
        }]
      }]
    };
    res = await fetch('http://localhost:3001/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockPayload)
    });
    data = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', data);

    // Test 6: Form Creation API (Check error handling / Meta call)
    console.log('\n--- Test 6: Form Creation (Meta Call Error Handling) ---');
    const formPayload = {
      name: 'Test Form from Integration Test',
      questions: [
        { type: 'FULL_NAME', label: 'Full Name' },
        { type: 'EMAIL', label: 'Email' }
      ]
    };
    res = await fetch('http://localhost:3001/api/forms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formPayload)
    });
    data = await res.json();
    console.log('Status:', res.status);
    console.log('Data success flag:', data.success);
    console.log('Response Error:', data.error ? (data.error.message || data.error) : 'None');

  } catch (err) {
    console.error('Error during testing:', err);
  } finally {
    stopServer();
  }
}

runTests();
