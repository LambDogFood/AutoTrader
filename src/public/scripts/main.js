// In your script.js or another JavaScript file

function toggleBot(accountName) {
  const dropdown = document.getElementById(`${accountName}-buttons`);
  if (dropdown) {
    dropdown.classList.toggle('show');
  }
}

function showTab(accountName, tab) {
  // ...
  if (tab === 'settings') {
    $("#bot-settings-content").show();
    $("#bot-info-content").hide();

    // Fetch the bot settings from the server
    $.get('/api/settings/' + accountName, function(settings) {
      $("#apiKey").val(settings.apiKey);
      // Set other settings here, e.g., apiSecret, paper, money, accountName, symbols
    });
  }
  // ...
}

$("#settings-form").submit(function(e) {
  e.preventDefault();

  // Use the selectedBotAccountName variable here
  const accountName = selectedBotAccountName;

  const apiKey = $("#apiKey").val();
  const apiSecret = $("#apiSecret").val();
  const paper = $("#paper").val();
  const money = $("#money").is(":checked");
  const accountNameInput = $("#accountName").val();
  const symbols = $("#symbols").val().split(',').map(symbol => symbol.trim());

  // Update the settings on the server
  $.post('/api/settings/' + accountName, { apiKey, apiSecret, paper, money, accountName: accountNameInput, symbols }, function() {
    console.log('Settings updated');
  });
});

document.querySelector('.side-bar').addEventListener('click', (event) => {
  const target = event.target;
  const accountName = target.closest('.bot-dropdown').id.split('-')[0];

  if (target.tagName === 'LI') {
    // Ensure the LI element is clicked, not its children
    const tabName = target.id.split('-')[1];
    showTab(accountName, tabName);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const sideBar = document.querySelector('.side-bar');

  // Prevent text selection on the entire side-bar
  sideBar.addEventListener('selectstart', (event) => {
    event.preventDefault();
  });

  // Event delegation for handling UL click events
  sideBar.addEventListener('mousedown', (event) => {
    const target = event.target;
    const accountName = target.closest('.bot-dropdown').id.split('-')[0];

    if (target.tagName === 'LI') {
      // Ensure the LI element is clicked, not its children
      const tabName = target.id.split('-')[1];
      showTab(accountName, tabName);

      // Prevent text selection
      event.preventDefault();
    }
  });


  function updateStatus(accountName) {
    fetch(`/api/status/${accountName}`)
      .then(response => response.json())
      .then(data => {
        const statusElement = document.getElementById(`${accountName}-status`);
        updateStatusBarColor(accountName, data.status);
      })
      .catch(error => console.error('Error fetching status:', error));
  }

  function updateAllStatus() {
    const botDropdowns = document.querySelectorAll('.bot-dropdown');
    botDropdowns.forEach(botDropdown => {
      const accountName = botDropdown.id.split('-')[0];
      updateStatus(accountName);
    });
  }

  const updateInterval = 5000;
  setInterval(updateAllStatus, updateInterval);

  document.querySelector('.side-bar').addEventListener('dblclick', (event) => {
    event.preventDefault();
  });

  // Function to update the status bar color based on the status
  function updateStatusBarColor(accountName, status) {
    const statusBar = document.getElementById(`${accountName}-status`);
  
    if (statusBar) {
      switch (status) {
        case 'Online':
          statusBar.style.backgroundColor = '#43b581'; // Online color
          break;
        case 'Idle':
          statusBar.style.backgroundColor = '#faa61a'; // Idle color
          break;
        case 'Offline':
          statusBar.style.backgroundColor = '#747f8d'; // Offline color
          break;
        default:
          console.error(`Invalid status: ${status}`);
      }
    } else {
      console.error(`Status bar with ID ${accountName}-status not found.`);
    }
  }
});