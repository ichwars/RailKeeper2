package application

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

const defaultECoSPort = 15471

type ECoSService struct {
	timeout time.Duration
}

type ECoSConnectionInput struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

type ECoSConnectionResult struct {
	Connected          bool              `json:"connected"`
	Host               string            `json:"host"`
	Port               int               `json:"port"`
	Status             string            `json:"status,omitempty"`
	ProtocolVersion    string            `json:"protocolVersion,omitempty"`
	ApplicationVersion string            `json:"applicationVersion,omitempty"`
	HardwareVersion    string            `json:"hardwareVersion,omitempty"`
	Message            string            `json:"message"`
	RawLines           []string          `json:"rawLines,omitempty"`
	Fields             map[string]string `json:"fields,omitempty"`
}

type ECoSLocomotive struct {
	ObjectID int    `json:"objectId"`
	Name     string `json:"name,omitempty"`
	Address  int    `json:"address,omitempty"`
	Protocol string `json:"protocol,omitempty"`
}

type ECoSLocomotivePreview struct {
	Host        string           `json:"host"`
	Port        int              `json:"port"`
	Locomotives []ECoSLocomotive `json:"locomotives"`
	RawLines    []string         `json:"rawLines,omitempty"`
	Message     string           `json:"message"`
}

func NewECoSService() *ECoSService {
	return &ECoSService{timeout: 5 * time.Second}
}

func (s *ECoSService) TestConnection(ctx context.Context, input ECoSConnectionInput) (*ECoSConnectionResult, error) {
	target, err := normalizeECoSInput(input)
	if err != nil {
		return nil, err
	}
	lines, err := s.exchange(ctx, target.Host, target.Port, "get(1, info, status)")
	result := &ECoSConnectionResult{
		Connected: false,
		Host:      target.Host,
		Port:      target.Port,
		Message:   "ECoS-Verbindung konnte nicht aufgebaut werden.",
	}
	if err != nil {
		result.Message = err.Error()
		return result, nil
	}
	fields := parseECoSFields(lines)
	result.Connected = true
	result.Status = fields["status"]
	result.ProtocolVersion = firstNonEmpty(fields["ProtocolVersion"], fields["protocolversion"])
	result.ApplicationVersion = firstNonEmpty(fields["ApplicationVersion"], fields["applicationversion"])
	result.HardwareVersion = firstNonEmpty(fields["HardwareVersion"], fields["hardwareversion"])
	result.Message = "ECoS-Verbindung erfolgreich."
	result.RawLines = lines
	result.Fields = fields
	return result, nil
}

func (s *ECoSService) PreviewLocomotives(ctx context.Context, input ECoSConnectionInput) (*ECoSLocomotivePreview, error) {
	target, err := normalizeECoSInput(input)
	if err != nil {
		return nil, err
	}
	lines, err := s.exchange(ctx, target.Host, target.Port, "queryObjects(10, addr, name, protocol)")
	if err != nil {
		return nil, err
	}
	locomotives := parseECoSLocomotives(lines)
	return &ECoSLocomotivePreview{
		Host:        target.Host,
		Port:        target.Port,
		Locomotives: locomotives,
		RawLines:    lines,
		Message:     fmt.Sprintf("%d ECoS-Lokomotiven gelesen.", len(locomotives)),
	}, nil
}

func (s *ECoSService) exchange(ctx context.Context, host string, port int, command string) ([]string, error) {
	timeout := s.timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		return nil, fmt.Errorf("ECoS nicht erreichbar: %w", err)
	}
	defer func() { _ = conn.Close() }()

	deadline := time.Now().Add(timeout)
	if err := conn.SetDeadline(deadline); err != nil {
		return nil, fmt.Errorf("ECoS-Zeitlimit konnte nicht gesetzt werden: %w", err)
	}
	if _, err := fmt.Fprintf(conn, "%s\r\n", strings.TrimSpace(command)); err != nil {
		return nil, fmt.Errorf("ECoS-Kommando konnte nicht gesendet werden: %w", err)
	}

	lines := []string{}
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		lines = append(lines, line)
		if strings.HasPrefix(line, "<END") {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("ECoS-Antwort konnte nicht gelesen werden: %w", err)
	}
	if len(lines) == 0 {
		return nil, errors.New("ECoS hat keine Antwort geliefert")
	}
	return lines, nil
}

func normalizeECoSInput(input ECoSConnectionInput) (ECoSConnectionInput, error) {
	host := strings.TrimSpace(input.Host)
	if host == "" {
		return ECoSConnectionInput{}, errors.New("ECoS-IP oder Hostname fehlt")
	}
	port := input.Port
	if port == 0 {
		port = defaultECoSPort
	}
	if port < 1 || port > 65535 {
		return ECoSConnectionInput{}, errors.New("ECoS-Port muss zwischen 1 und 65535 liegen")
	}
	return ECoSConnectionInput{Host: host, Port: port}, nil
}

func parseECoSFields(lines []string) map[string]string {
	fields := map[string]string{}
	for _, line := range lines {
		if strings.HasPrefix(line, "<") {
			continue
		}
		for key, value := range parseECoSArguments(line) {
			fields[key] = value
		}
	}
	return fields
}

func parseECoSLocomotives(lines []string) []ECoSLocomotive {
	locomotives := []ECoSLocomotive{}
	for _, line := range lines {
		if strings.HasPrefix(line, "<") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		objectID, err := strconv.Atoi(fields[0])
		if err != nil || objectID <= 0 {
			continue
		}
		args := parseECoSArguments(line)
		address, _ := strconv.Atoi(args["addr"])
		locomotives = append(locomotives, ECoSLocomotive{
			ObjectID: objectID,
			Name:     strings.Trim(args["name"], "\""),
			Address:  address,
			Protocol: args["protocol"],
		})
	}
	return locomotives
}

func parseECoSArguments(line string) map[string]string {
	out := map[string]string{}
	for index := 0; index < len(line); index++ {
		if line[index] != '[' {
			continue
		}
		keyStart := index - 1
		for keyStart >= 0 {
			c := line[keyStart]
			if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' {
				keyStart--
				continue
			}
			break
		}
		key := strings.TrimSpace(line[keyStart+1 : index])
		if key == "" {
			continue
		}
		valueStart := index + 1
		valueEnd := valueStart
		inQuote := false
		escaped := false
		for valueEnd < len(line) {
			c := line[valueEnd]
			if escaped {
				escaped = false
				valueEnd++
				continue
			}
			if c == '\\' {
				escaped = true
				valueEnd++
				continue
			}
			if c == '"' {
				inQuote = !inQuote
				valueEnd++
				continue
			}
			if c == ']' && !inQuote {
				break
			}
			valueEnd++
		}
		if valueEnd >= len(line) {
			continue
		}
		out[key] = strings.TrimSpace(line[valueStart:valueEnd])
		index = valueEnd
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
