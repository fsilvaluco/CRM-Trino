#!/usr/bin/env node
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

async function getUsers() {
  try {
    const response = await fetch(`${url}/auth/v1/admin/users`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to fetch users:', response.statusText);
      process.exit(1);
    }

    const data = await response.json();
    console.log('\n📋 Available test users:\n');
    
    if (data.users && data.users.length > 0) {
      data.users.slice(0, 5).forEach((user, i) => {
        console.log(`${i + 1}. Email: ${user.email}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Created: ${new Date(user.created_at).toLocaleDateString()}`);
        console.log('');
      });
      
      console.log('💡 Use any of these emails with their password to log in.');
      console.log('   (Password was set during user creation)\n');
    } else {
      console.log('⚠️  No users found in the database.');
      console.log('   You may need to create a test user first.\n');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getUsers();
