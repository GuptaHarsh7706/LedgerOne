import faiss
import numpy as np
import pypdfium2
import torch


def test_pytorch_cuda_and_cpu_operations():
    """Verify PyTorch tensor mathematics and CUDA GPU detection."""
    # 1. CPU Tensor math
    t_cpu = torch.tensor([1.0, 2.0, 3.0, 4.0])
    assert torch.sum(t_cpu).item() == 10.0

    # 2. CUDA detection on RTX 3050 Laptop GPU
    has_cuda = torch.cuda.is_available()
    assert has_cuda is True, "CUDA hardware acceleration is required on target hardware"

    device_name = torch.cuda.get_device_name(0)
    assert "RTX 3050" in device_name or "NVIDIA" in device_name

    # 3. GPU Tensor allocation
    t_gpu = t_cpu.to("cuda")
    assert t_gpu.is_cuda is True
    res_gpu = torch.matmul(t_gpu, t_gpu).item()
    assert res_gpu == 30.0
    print(
        f"\n[PASS] PyTorch CUDA acceleration verified on {device_name} (CUDA {torch.version.cuda})"
    )


def test_faiss_vector_indexing_and_similarity():
    """Verify FAISS vector index creation, L2-normalization, and Inner Product similarity search."""
    dim = 384  # Standard dimension matching bge-small-en-v1.5 & vector(384)
    index = faiss.IndexFlatIP(dim)
    assert index.is_trained is True

    # Generate 5 normalized synthetic vectors
    np.random.seed(42)
    vectors = np.random.randn(5, dim).astype(np.float32)
    faiss.normalize_L2(vectors)

    # Add vectors to FAISS index
    index.add(vectors)
    assert index.ntotal == 5

    # Query with first vector (must return index 0 as nearest neighbor with similarity ~1.0)
    query = vectors[0:1]
    similarities, indices = index.search(query, k=3)

    assert indices[0][0] == 0
    assert abs(similarities[0][0] - 1.0) < 1e-4
    print(
        "\n[PASS] FAISS 384-dim IndexFlatIP similarity search verified with unit recall"
    )


def test_pypdfium2_document_rendering():
    """Verify pypdfium2 PDF page rendering and geometry extraction without external binaries."""
    # Create a minimal valid blank PDF in memory
    pdf = pypdfium2.PdfDocument.new()
    page = pdf.new_page(width=595, height=842)  # A4 dimensions
    assert len(pdf) == 1

    # Render page to PIL image
    pil_image = page.render(scale=1.0).to_pil()
    assert pil_image.width == 595
    assert pil_image.height == 842
    print(
        f"\n[PASS] pypdfium2 in-memory PDF rendering verified ({pil_image.width}x{pil_image.height}) with zero external Poppler binaries"
    )
