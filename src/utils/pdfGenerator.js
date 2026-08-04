import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const generatePDF = async (tableElement, filename = 'SSGC_Cash_Transfers.pdf') => {
  try {
    // Create a temporary container for the PDF content
    const pdfContainer = document.createElement('div');
    pdfContainer.style.position = 'absolute';
    pdfContainer.style.left = '-9999px';
    pdfContainer.style.width = '800px';
    pdfContainer.style.padding = '20px';
    pdfContainer.style.backgroundColor = '#ffffff';
    
    // Clone the table and add heading
    const heading = document.createElement('h1');
    heading.textContent = 'Sri Shakthi Ganapathi Committee';
    heading.style.textAlign = 'center';
    heading.style.marginBottom = '20px';
    heading.style.fontSize = '24px';
    heading.style.fontWeight = 'bold';
    heading.style.color = '#333';
    
    const clonedTable = tableElement.cloneNode(true);
    clonedTable.style.width = '100%';
    clonedTable.style.borderCollapse = 'collapse';
    
    pdfContainer.appendChild(heading);
    pdfContainer.appendChild(clonedTable);
    document.body.appendChild(pdfContainer);
    
    // Generate PDF using html2canvas and jsPDF
    const canvas = await html2canvas(pdfContainer, {
      scale: 2,
      useCORS: true,
      logging: false,
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4'); // landscape orientation
    
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
    const imgScaledWidth = imgWidth * ratio;
    const imgScaledHeight = imgHeight * ratio;
    
    pdf.addImage(imgData, 'PNG', 0, 0, imgScaledWidth, imgScaledHeight);
    
    // Clean up
    document.body.removeChild(pdfContainer);
    
    // Save the PDF
    pdf.save(filename);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

