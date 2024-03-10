document.addEventListener('DOMContentLoaded', function () {

    const apiUrl = 'http://localhost:3000/api';
    fetch(`${apiUrl}/profiles`)
      .then(response => response.json())
      .then(data => {

        console.log(data);

        const accountNameDropdown = document.getElementById('accountName');
        for (const accountName in data) {
          const option = document.createElement('option');
          option.value = accountName;
          option.textContent = accountName;
          accountNameDropdown.appendChild(option);
        };
      })
      .catch(error => console.error('Error fetching bot names:', error));
  
    function startBot() {
      const accountName = document.getElementById('accountName').value;
      fetch(`${apiUrl}/start/${accountName}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => displayResult(data.message))
        .catch(error => displayResult(`Error: ${error.message}`));
    }
  
    function shutdownBot() {
      const accountName = document.getElementById('accountName').value;
      fetch(`${apiUrl}/shutdown/${accountName}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => displayResult(data.message))
        .catch(error => displayResult(`Error: ${error.message}`));
    }
  
    function displayResult(message) {
      document.getElementById('result').innerText = message;
    }
  });