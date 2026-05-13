package application

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
)

func TestParseECoSLocomotives(t *testing.T) {
	lines := []string{
		"<REPLY queryObjects(10, addr, name, protocol)>",
		`1001 addr[3] name["BR 218"] protocol[DCC128]`,
		`1002 addr[24] name["V 180"] protocol[MM27]`,
		"<END 0 (OK)>",
	}

	locomotives := parseECoSLocomotives(lines)
	if len(locomotives) != 2 {
		t.Fatalf("expected two locomotives, got %d", len(locomotives))
	}
	if locomotives[0].ObjectID != 1001 || locomotives[0].Name != "BR 218" || locomotives[0].Address != 3 || locomotives[0].Protocol != "DCC128" {
		t.Fatalf("unexpected first locomotive: %#v", locomotives[0])
	}
}

func TestECoSServiceTestConnection(t *testing.T) {
	listener := startECoSTestServer(t, func(command string) []string {
		if command != "get(1, info, status)" {
			t.Fatalf("unexpected command: %s", command)
		}
		return []string{
			"<REPLY get(1, info, status)>",
			"1 status[GO]",
			"1 ProtocolVersion[0.5]",
			"1 ApplicationVersion[4.2.2]",
			"1 HardwareVersion[2.1]",
			"<END 0 (OK)>",
		}
	})
	defer func() { _ = listener.Close() }()

	host, port := splitTestAddress(t, listener.Addr().String())
	service := NewECoSService()
	result, err := service.TestConnection(context.Background(), ECoSConnectionInput{Host: host, Port: port})
	if err != nil {
		t.Fatalf("test connection failed: %v", err)
	}
	if !result.Connected || result.Status != "GO" || result.ProtocolVersion != "0.5" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestECoSServicePreviewLocomotives(t *testing.T) {
	listener := startECoSTestServer(t, func(command string) []string {
		if command != "queryObjects(10, addr, name, protocol)" {
			t.Fatalf("unexpected command: %s", command)
		}
		return []string{
			"<REPLY queryObjects(10, addr, name, protocol)>",
			`1001 addr[3] name["BR 218"] protocol[DCC128]`,
			"<END 0 (OK)>",
		}
	})
	defer func() { _ = listener.Close() }()

	host, port := splitTestAddress(t, listener.Addr().String())
	service := NewECoSService()
	preview, err := service.PreviewLocomotives(context.Background(), ECoSConnectionInput{Host: host, Port: port})
	if err != nil {
		t.Fatalf("preview failed: %v", err)
	}
	if len(preview.Locomotives) != 1 || preview.Locomotives[0].Name != "BR 218" {
		t.Fatalf("unexpected preview: %#v", preview)
	}
}

func startECoSTestServer(t *testing.T, handler func(command string) []string) net.Listener {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen failed: %v", err)
	}
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		reader := bufio.NewReader(conn)
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		for _, responseLine := range handler(strings.TrimSpace(line)) {
			_, _ = fmt.Fprint(conn, responseLine+"\r\n")
		}
	}()
	return listener
}

func splitTestAddress(t *testing.T, address string) (string, int) {
	t.Helper()
	host, portText, err := net.SplitHostPort(address)
	if err != nil {
		t.Fatalf("split host port: %v", err)
	}
	var port int
	if _, err := fmt.Sscanf(portText, "%d", &port); err != nil {
		t.Fatalf("parse port: %v", err)
	}
	return host, port
}
