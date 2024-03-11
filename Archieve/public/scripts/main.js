// LordDogFood

function toggleBot(accountName) {
  const dropdown = document.getElementById(`${accountName}-buttons`);
  if (dropdown) {
    dropdown.classList.toggle('show');
  }
}

document.addEventListener('DOMContentLoaded', () => {

  const sideBar = document.querySelector('.side-bar');
  sideBar.addEventListener('dblclick', (event) => {
    event.preventDefault();
  });
  sideBar.addEventListener('selectstart', (event) => {
    event.preventDefault();
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
  };  updateAllStatus();
  setInterval(updateAllStatus, 5000);

  function updateStatusBarColor(accountName, status) {
    const statusBar = document.getElementById(`${accountName}-status`);

    if (statusBar) {
      switch (status) {
        case 'Online':
          statusBar.style.backgroundColor = '#43b581'; 
          break;
        case 'Idle':
          statusBar.style.backgroundColor = '#faa61a';
          break;
        case 'Offline':
          statusBar.style.backgroundColor = '#747f8d';
          break;
        default:
          statusBar.style.backgroundColor = '#747f8d';
          console.error(`Invalid status: ${status}`);
      }
    } else {
      console.error(`Status bar with ID ${accountName}-status not found.`);
    }
  }
});